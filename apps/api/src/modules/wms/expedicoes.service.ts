import type {
  CreateExpedicaoInput,
  Expedicao,
  ExpedicaoDetalhe,
  SepararExpedicaoItemInput,
} from '@rigabras/shared';
import { TRANSICOES_STATUS_EXPEDICAO } from '@rigabras/shared';
import { ExpedicoesRepository, type ListExpedicoesFilter } from './expedicoes.repository.js';
import { DepositantesRepository } from './depositantes.repository.js';
import { ProdutosRepository } from './produtos.repository.js';
import { EnderecosRepository } from './enderecos.repository.js';
import { EstoqueRepository } from './estoque.repository.js';
import { InvalidStateTransitionError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

/**
 * Serviço de Separação/Reembalagem/Etiquetagem e Cross-docking/Expedição
 * (Módulo 5, critérios #3 e #4): a expedição percorre uma máquina de estados
 * explícita (`TRANSICOES_STATUS_EXPEDICAO`) com etapas timestampadas, mesmo
 * racional do fluxo de travessia de fronteira do Módulo 2. Uma expedição
 * CROSS_DOCKING pode pular a separação por endereço "normal" — a mercadoria
 * é roteada direto para expedição, registrada com o tipo de movimentação
 * `CROSS_DOCKING` (chave estável, usada pelo futuro Módulo 6 de integração
 * TMS+WMS — ver nota de modelagem na migration 0006).
 */
export class ExpedicoesService {
  constructor(
    private readonly repo: ExpedicoesRepository = new ExpedicoesRepository(),
    private readonly depositantesRepo: DepositantesRepository = new DepositantesRepository(),
    private readonly produtosRepo: ProdutosRepository = new ProdutosRepository(),
    private readonly enderecosRepo: EnderecosRepository = new EnderecosRepository(),
    private readonly estoqueRepo: EstoqueRepository = new EstoqueRepository(),
  ) {}

  list(filter: ListExpedicoesFilter) {
    return this.repo.list(filter);
  }

  async getById(id: string): Promise<ExpedicaoDetalhe> {
    const expedicao = await this.repo.findById(id);
    if (!expedicao) throw new NotFoundError('expedicao', id);
    const itens = await this.repo.listItens(id);
    return { ...expedicao, itens };
  }

  async create(
    input: CreateExpedicaoInput,
    userId: string | null,
    ip: string | null,
  ): Promise<ExpedicaoDetalhe> {
    const depositante = await this.depositantesRepo.findById(input.depositante_id);
    if (!depositante) throw new NotFoundError('depositante', input.depositante_id);
    for (const item of input.itens) {
      const produto = await this.produtosRepo.findById(item.produto_id);
      if (!produto) throw new NotFoundError('produto_armazenado', item.produto_id);
    }

    const created = await this.repo.create(
      {
        depositante_id: input.depositante_id,
        referencia_documento: input.referencia_documento ?? null,
        tipo: input.tipo ?? 'NORMAL',
        observacoes: input.observacoes ?? null,
      },
      userId,
    );
    const itens = await this.repo.createItens(created.id, input.itens);

    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'expedicoes',
      entityId: created.id,
      changes: { after: { ...created, itens } },
      ip,
    });
    return { ...created, itens };
  }

  private assertTransicao(atual: Expedicao['status'], proximo: Expedicao['status']): void {
    const validos = TRANSICOES_STATUS_EXPEDICAO[atual ?? 'SOLICITADA'];
    if (!validos.includes(proximo!)) {
      throw new InvalidStateTransitionError(atual ?? 'SOLICITADA', proximo ?? '');
    }
  }

  private async transicionar(
    id: string,
    novoStatus: Expedicao['status'],
    userId: string | null,
    ip: string | null,
    extra?: Partial<Expedicao>,
  ): Promise<Expedicao> {
    const expedicao = await this.repo.findById(id);
    if (!expedicao) throw new NotFoundError('expedicao', id);
    this.assertTransicao(expedicao.status, novoStatus);

    const updated = await this.repo.update(id, { status: novoStatus, ...extra });
    await writeAuditLog({
      userId,
      action: 'STATUS_CHANGE',
      entity: 'expedicoes',
      entityId: id,
      changes: { before: expedicao.status, after: updated.status },
      ip,
    });
    return updated;
  }

  iniciarSeparacao(id: string, userId: string | null, ip: string | null) {
    return this.transicionar(id, 'EM_SEPARACAO', userId, ip);
  }

  /** Separa um item (retira do endereço informado) — gera uma movimentação SEPARACAO (ou CROSS_DOCKING) no ledger. */
  async separarItem(
    expedicaoId: string,
    itemId: string,
    input: SepararExpedicaoItemInput,
    userId: string | null,
    ip: string | null,
  ) {
    const expedicao = await this.repo.findById(expedicaoId);
    if (!expedicao) throw new NotFoundError('expedicao', expedicaoId);
    if (expedicao.status !== 'EM_SEPARACAO' && expedicao.status !== 'SOLICITADA') {
      throw new InvalidStateTransitionError(expedicao.status ?? 'SOLICITADA', 'SEPARAR_ITEM');
    }

    const item = await this.repo.findItemById(itemId);
    if (!item || item.expedicao_id !== expedicaoId) {
      throw new NotFoundError('expedicao_item', itemId);
    }
    const endereco = await this.enderecosRepo.findById(input.endereco_id);
    if (!endereco) throw new NotFoundError('endereco_armazem', input.endereco_id);

    const updatedItem = await this.repo.updateItem(itemId, {
      quantidade_separada: input.quantidade_separada,
      endereco_id: input.endereco_id,
    });

    if (input.quantidade_separada > 0) {
      await this.estoqueRepo.registrarMovimentacao(
        {
          produto_id: item.produto_id,
          tipo_movimentacao: expedicao.tipo === 'CROSS_DOCKING' ? 'CROSS_DOCKING' : 'SEPARACAO',
          quantidade: input.quantidade_separada,
          endereco_origem_id: input.endereco_id,
          expedicao_id: expedicaoId,
          referencia_documento: expedicao.referencia_documento ?? undefined,
        },
        userId,
      );
    }

    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'expedicao_itens',
      entityId: itemId,
      changes: { before: item, after: updatedItem },
      ip,
    });
    return updatedItem;
  }

  /** Marca reembalagem/etiquetagem de um item — registra um evento de rastreabilidade no ledger (sem alterar saldo, salvo se também informar um novo endereço). */
  async marcarReembalagemEtiquetagem(
    expedicaoId: string,
    itemId: string,
    flags: { reembalado?: boolean; etiquetado?: boolean },
    userId: string | null,
    ip: string | null,
  ) {
    const item = await this.repo.findItemById(itemId);
    if (!item || item.expedicao_id !== expedicaoId) {
      throw new NotFoundError('expedicao_item', itemId);
    }
    const updatedItem = await this.repo.updateItem(itemId, flags);

    if (flags.reembalado && item.quantidade_separada) {
      await this.estoqueRepo.registrarMovimentacao(
        {
          produto_id: item.produto_id,
          tipo_movimentacao: 'REEMBALAGEM',
          quantidade: item.quantidade_separada,
          expedicao_id: expedicaoId,
        },
        userId,
      );
    }
    if (flags.etiquetado && item.quantidade_separada) {
      await this.estoqueRepo.registrarMovimentacao(
        {
          produto_id: item.produto_id,
          tipo_movimentacao: 'ETIQUETAGEM',
          quantidade: item.quantidade_separada,
          expedicao_id: expedicaoId,
        },
        userId,
      );
    }

    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'expedicao_itens',
      entityId: itemId,
      changes: { before: item, after: updatedItem },
      ip,
    });
    return updatedItem;
  }

  async concluirSeparacao(id: string, userId: string | null, ip: string | null) {
    return this.transicionar(id, 'SEPARADA', userId, ip);
  }

  async marcarProntaExpedicao(id: string, userId: string | null, ip: string | null) {
    return this.transicionar(id, 'PRONTA_EXPEDICAO', userId, ip);
  }

  /** Expede a mercadoria: registra o evento final EXPEDICAO no ledger para cada item já separado (rastreabilidade — o saldo já havia sido baixado na separação/cross-docking). */
  async expedir(id: string, userId: string | null, ip: string | null): Promise<ExpedicaoDetalhe> {
    const expedicao = await this.repo.findById(id);
    if (!expedicao) throw new NotFoundError('expedicao', id);
    this.assertTransicao(expedicao.status, 'EXPEDIDA');

    const itens = await this.repo.listItens(id);
    for (const item of itens) {
      if (item.quantidade_separada) {
        await this.estoqueRepo.registrarMovimentacao(
          {
            produto_id: item.produto_id,
            tipo_movimentacao: 'EXPEDICAO',
            quantidade: item.quantidade_separada,
            expedicao_id: id,
            referencia_documento: expedicao.referencia_documento ?? undefined,
          },
          userId,
        );
      }
    }

    const updated = await this.repo.update(id, {
      status: 'EXPEDIDA',
      data_expedicao: new Date().toISOString(),
    });
    await writeAuditLog({
      userId,
      action: 'STATUS_CHANGE',
      entity: 'expedicoes',
      entityId: id,
      changes: { before: expedicao.status, after: updated.status },
      ip,
    });
    return { ...updated, itens };
  }

  async cancelar(id: string, userId: string | null, ip: string | null) {
    return this.transicionar(id, 'CANCELADA', userId, ip);
  }
}
