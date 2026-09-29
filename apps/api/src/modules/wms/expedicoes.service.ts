import type {
  CreateExpedicaoInput,
  Expedicao,
  ExpedicaoDetalhe,
  SepararExpedicaoItemInput,
} from '@rigabras/shared';
import {
  STATUS_VIAGEM_COMPATIVEIS_COM_WMS_PRONTA,
  TRANSICOES_STATUS_EXPEDICAO,
} from '@rigabras/shared';
import { ExpedicoesRepository, type ListExpedicoesFilter } from './expedicoes.repository.js';
import { DepositantesRepository } from './depositantes.repository.js';
import { ProdutosRepository } from './produtos.repository.js';
import { EnderecosRepository } from './enderecos.repository.js';
import { EstoqueRepository } from './estoque.repository.js';
import { ViagensRepository } from '../viagens/viagens.repository.js';
import { ConflictError, InvalidStateTransitionError, NotFoundError } from '../../lib/errors.js';
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
    private readonly viagensRepo: ViagensRepository = new ViagensRepository(),
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
    if (input.viagem_id) {
      const viagem = await this.viagensRepo.findById(input.viagem_id);
      if (!viagem) throw new NotFoundError('viagem', input.viagem_id);
    }

    const created = await this.repo.create(
      {
        depositante_id: input.depositante_id,
        viagem_id: input.viagem_id ?? null,
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

  /**
   * Módulo 6 (Integração TMS+WMS): vincula (ou revincula) uma expedição já
   * criada a uma viagem do TMS. A validação de compatibilidade de status da
   * viagem só acontece em `marcarProntaExpedicao` (o vínculo em si pode ser
   * feito cedo, antes da viagem existir em um status "pronta para coleta").
   */
  async vincularViagem(
    id: string,
    viagemId: string,
    userId: string | null,
    ip: string | null,
  ): Promise<Expedicao> {
    const expedicao = await this.repo.findById(id);
    if (!expedicao) throw new NotFoundError('expedicao', id);
    const viagem = await this.viagensRepo.findById(viagemId);
    if (!viagem) throw new NotFoundError('viagem', viagemId);

    const updated = await this.repo.update(id, { viagem_id: viagemId });
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'expedicoes',
      entityId: id,
      changes: { before: { viagem_id: expedicao.viagem_id }, after: { viagem_id: viagemId } },
      ip,
    });
    return updated;
  }

  /**
   * Módulo 6, critério "Expedição -> Viagem": quando uma expedição vinculada
   * a uma viagem vai ser marcada PRONTA_EXPEDICAO, valida ANTES de
   * transicionar (nunca depois — evita persistir a expedição como
   * PRONTA_EXPEDICAO e só então rejeitar) que a viagem vinculada exista e
   * esteja em um status compatível
   * (`STATUS_VIAGEM_COMPATIVEIS_COM_WMS_PRONTA` — ainda não partiu). Uma
   * viagem em status incompatível (ex: já EM_TRANSITO) rejeita a marcação
   * com 409 — o operador do armazém sabe então que algo está errado (viagem
   * já partiu sem a carga).
   */
  private async validarViagemParaProntaExpedicao(
    expedicao: Expedicao,
  ): Promise<import('@rigabras/shared').Viagem | null> {
    if (!expedicao.viagem_id) return null;
    const viagem = await this.viagensRepo.findById(expedicao.viagem_id);
    if (!viagem) throw new NotFoundError('viagem', expedicao.viagem_id);
    if (!STATUS_VIAGEM_COMPATIVEIS_COM_WMS_PRONTA.includes(viagem.status)) {
      throw new ConflictError(
        `A viagem vinculada (${viagem.id}) está no status "${viagem.status}", incompatível com o aviso de mercadoria pronta para expedição (esperado um dos: ${STATUS_VIAGEM_COMPATIVEIS_COM_WMS_PRONTA.join(', ')})`,
      );
    }
    return viagem;
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
    // Um item só é separado uma vez: separar de novo baixaria o saldo em dobro.
    if (item.quantidade_separada != null) {
      throw new ConflictError('Este item da expedição já foi separado');
    }
    const endereco = await this.enderecosRepo.findById(input.endereco_id);
    if (!endereco) throw new NotFoundError('endereco_armazem', input.endereco_id);

    // Baixa o saldo ANTES de marcar o item como separado: se o endereço não
    // tiver saldo suficiente a movimentação é rejeitada (422) e o item não
    // fica marcado como separado sem ter saído do estoque.
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

    const updatedItem = await this.repo.updateItem(itemId, {
      quantidade_separada: input.quantidade_separada,
      endereco_id: input.endereco_id,
    });

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

    if (flags.reembalado && !item.reembalado && item.quantidade_separada) {
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
    if (flags.etiquetado && !item.etiquetado && item.quantidade_separada) {
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
    const antes = await this.repo.findById(id);
    if (!antes) throw new NotFoundError('expedicao', id);
    const viagem = await this.validarViagemParaProntaExpedicao(antes);

    const updated = await this.transicionar(id, 'PRONTA_EXPEDICAO', userId, ip);

    if (viagem) {
      await this.viagensRepo.insertStatusHistory({
        viagemId: viagem.id,
        statusAnterior: viagem.status,
        statusNovo: viagem.status,
        changedBy: userId,
        observacoes: `[WMS] Expedição ${updated.referencia_documento ?? updated.id} marcada como PRONTA_EXPEDICAO — mercadoria pronta para coleta no armazém.`,
        origemEvento: 'WMS',
      });
    }
    return updated;
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

  /**
   * Cancela a expedição. Itens já separados tiveram o saldo baixado do
   * endereço (SEPARACAO/CROSS_DOCKING): a mercadoria volta ao endereço de
   * origem via movimentação ENDERECAMENTO (entrada pura), para não perder
   * estoque em silêncio.
   */
  async cancelar(id: string, userId: string | null, ip: string | null) {
    const expedicao = await this.repo.findById(id);
    if (!expedicao) throw new NotFoundError('expedicao', id);
    this.assertTransicao(expedicao.status, 'CANCELADA');

    const itens = await this.repo.listItens(id);
    for (const item of itens) {
      if (item.quantidade_separada && item.endereco_id) {
        await this.estoqueRepo.registrarMovimentacao(
          {
            produto_id: item.produto_id,
            tipo_movimentacao: 'ENDERECAMENTO',
            quantidade: item.quantidade_separada,
            endereco_destino_id: item.endereco_id,
            expedicao_id: id,
            referencia_documento: expedicao.referencia_documento ?? undefined,
            observacoes: 'Estorno da separação por cancelamento da expedição',
          },
          userId,
        );
      }
    }
    return this.transicionar(id, 'CANCELADA', userId, ip);
  }
}
