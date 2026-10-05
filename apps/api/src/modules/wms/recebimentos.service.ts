import type {
  AddRecebimentoItemInput,
  ConferirRecebimentoItemInput,
  CreateRecebimentoInput,
  Recebimento,
  RecebimentoDetalhe,
  UpdateRecebimentoItemInput,
  Viagem,
} from '@rigabras/shared';
import { TRANSICOES_STATUS_RECEBIMENTO } from '@rigabras/shared';
import { RecebimentosRepository, type ListRecebimentosFilter } from './recebimentos.repository.js';
import { DepositantesRepository } from './depositantes.repository.js';
import { ProdutosRepository } from './produtos.repository.js';
import { EnderecosRepository } from './enderecos.repository.js';
import { EstoqueRepository } from './estoque.repository.js';
import { ConflictError, InvalidStateTransitionError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

/**
 * Serviço de Recebimento e Conferência (Módulo 5, critério #2): registra a
 * expectativa de recebimento (opcionalmente contra uma referência de
 * compra/embarque), conduz a conferência item a item (quantidade recebida x
 * esperada, condição) e o endereçamento no armazém. Cada item conferido gera
 * uma linha imutável no ledger (`movimentacoes_estoque`, tipo RECEBIMENTO) —
 * nunca apenas um update de um campo de quantidade.
 */
export class RecebimentosService {
  constructor(
    private readonly repo: RecebimentosRepository = new RecebimentosRepository(),
    private readonly depositantesRepo: DepositantesRepository = new DepositantesRepository(),
    private readonly produtosRepo: ProdutosRepository = new ProdutosRepository(),
    private readonly enderecosRepo: EnderecosRepository = new EnderecosRepository(),
    private readonly estoqueRepo: EstoqueRepository = new EstoqueRepository(),
  ) {}

  list(filter: ListRecebimentosFilter) {
    return this.repo.list(filter);
  }

  async getById(id: string): Promise<RecebimentoDetalhe> {
    const recebimento = await this.repo.findById(id);
    if (!recebimento) throw new NotFoundError('recebimento', id);
    const itens = await this.repo.listItens(id);
    return { ...recebimento, itens };
  }

  async create(
    input: CreateRecebimentoInput,
    userId: string | null,
    ip: string | null,
  ): Promise<RecebimentoDetalhe> {
    const depositante = await this.depositantesRepo.findById(input.depositante_id);
    if (!depositante) throw new NotFoundError('depositante', input.depositante_id);
    for (const item of input.itens) {
      await this.validarProdutoDoRecebimento(input.depositante_id, item.produto_id);
    }

    const created = await this.repo.create(
      {
        depositante_id: input.depositante_id,
        referencia_documento: input.referencia_documento ?? null,
        data_prevista: input.data_prevista ?? null,
        observacoes: input.observacoes ?? null,
      },
      userId,
    );
    const itens = await this.repo.createItens(created.id, input.itens);

    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'recebimentos',
      entityId: created.id,
      changes: { after: { ...created, itens } },
      ip,
    });
    return { ...created, itens };
  }

  /**
   * Módulo 6 (Integração TMS+WMS), critério "Entrega -> Recebimento": cria
   * (ou retorna, se já existir — idempotente por `viagem_id`) um
   * `recebimento` a partir de uma viagem do TMS marcada ENTREGUE com
   * `destino_armazem_rigabras = true`. Cria SOMENTE o cabeçalho (depositante,
   * referência = CRT, data prevista, observações com os dados da carga já
   * conhecidos pelo TMS) — o TMS não detalha SKU/quantidade da carga
   * transportada, então os itens do recebimento continuam sendo lançados
   * manualmente pelo armazém na conferência, exatamente como em um
   * recebimento criado pelo próprio Módulo 5. Isso ainda elimina a
   * redigitação dos dados de cabeçalho (critério "not re-entering the same
   * data"). Nunca bloqueia a confirmação de entrega: se o depositante não
   * estiver configurado na viagem, lança `ConflictError` para o chamador
   * registrar a falha como uma nota WMS (ver `ViagensService.changeStatus`),
   * em vez de impedir a entrega.
   */
  async criarAutomaticoDeViagem(
    viagem: Viagem,
    userId: string | null,
    ip: string | null,
  ): Promise<RecebimentoDetalhe> {
    const existente = await this.repo.findByViagemId(viagem.id);
    if (existente) {
      const itens = await this.repo.listItens(existente.id);
      return { ...existente, itens };
    }

    if (!viagem.depositante_id) {
      throw new ConflictError(
        'A viagem está marcada para entrega no Armazém Rigabras (destino_armazem_rigabras=true), mas não possui um depositante vinculado (viagens.depositante_id). Associe um depositante à viagem antes de confirmar a entrega para permitir a criação automática do recebimento.',
      );
    }
    const depositante = await this.depositantesRepo.findById(viagem.depositante_id);
    if (!depositante) throw new NotFoundError('depositante', viagem.depositante_id);

    const created = await this.repo.create(
      {
        depositante_id: viagem.depositante_id,
        viagem_id: viagem.id,
        referencia_documento: viagem.numero_crt ?? viagem.id,
        data_prevista: new Date().toISOString().slice(0, 10),
        observacoes:
          `Recebimento gerado automaticamente pela Integração TMS+WMS (Módulo 6) a partir da entrega da viagem ${viagem.numero_crt ?? viagem.id}. ` +
          `Peso informado no TMS: ${viagem.peso_kg ?? 'não informado'} kg. Origem: ${viagem.origem} / Destino: ${viagem.destino}. ` +
          'Os itens (SKU/quantidade) devem ser conferidos e lançados manualmente pelo armazém — o TMS não detalha a composição da carga.',
      },
      userId,
    );

    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'recebimentos',
      entityId: created.id,
      changes: { after: created, origem: { viagem_id: viagem.id } },
      ip,
    });
    return { ...created, itens: [] };
  }

  private assertTransicao(atual: Recebimento['status'], proximo: Recebimento['status']): void {
    const validos = TRANSICOES_STATUS_RECEBIMENTO[atual ?? 'AGUARDANDO'];
    if (!validos.includes(proximo!)) {
      throw new InvalidStateTransitionError(atual ?? 'AGUARDANDO', proximo ?? '');
    }
  }

  /** Checklist de entrada: só editável enquanto o recebimento está AGUARDANDO (antes da conferência). */
  private async exigirEditavel(id: string): Promise<Recebimento> {
    const recebimento = await this.repo.findById(id);
    if (!recebimento) throw new NotFoundError('recebimento', id);
    if ((recebimento.status ?? 'AGUARDANDO') !== 'AGUARDANDO') {
      throw new ConflictError(
        'Os itens só podem ser alterados enquanto o recebimento está aguardando conferência',
      );
    }
    return recebimento;
  }

  private async validarProdutoDoRecebimento(
    depositanteId: string,
    produtoId: string,
  ): Promise<void> {
    const produto = await this.produtosRepo.findById(produtoId);
    if (!produto) throw new NotFoundError('produto_armazenado', produtoId);
    if (produto.depositante_id !== depositanteId) {
      throw new ConflictError(
        'O produto pertence a outro depositante que não o deste recebimento',
      );
    }
  }

  async addItem(
    id: string,
    input: AddRecebimentoItemInput,
    userId: string | null,
    ip: string | null,
  ): Promise<RecebimentoDetalhe> {
    const recebimento = await this.exigirEditavel(id);
    await this.validarProdutoDoRecebimento(recebimento.depositante_id, input.produto_id);

    const item = await this.repo.createItem(id, input);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'recebimento_itens',
      entityId: item.id,
      changes: { after: item, recebimento_id: id },
      ip,
    });
    const itens = await this.repo.listItens(id);
    return { ...recebimento, itens };
  }

  async updateItem(
    id: string,
    itemId: string,
    input: UpdateRecebimentoItemInput,
    userId: string | null,
    ip: string | null,
  ): Promise<RecebimentoDetalhe> {
    const recebimento = await this.exigirEditavel(id);
    const item = await this.repo.findItemById(itemId);
    if (!item || item.recebimento_id !== id) throw new NotFoundError('recebimento_item', itemId);
    if (item.quantidade_conferida != null) {
      throw new ConflictError('Um item já conferido não pode ser alterado');
    }

    const updated = await this.repo.updateItem(itemId, {
      ...(input.quantidade_esperada !== undefined
        ? { quantidade_esperada: input.quantidade_esperada }
        : {}),
      ...(input.observacoes !== undefined ? { observacoes: input.observacoes } : {}),
    });
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'recebimento_itens',
      entityId: itemId,
      changes: { before: item, after: updated },
      ip,
    });
    const itens = await this.repo.listItens(id);
    return { ...recebimento, itens };
  }

  async removeItem(
    id: string,
    itemId: string,
    userId: string | null,
    ip: string | null,
  ): Promise<RecebimentoDetalhe> {
    const recebimento = await this.exigirEditavel(id);
    const item = await this.repo.findItemById(itemId);
    if (!item || item.recebimento_id !== id) throw new NotFoundError('recebimento_item', itemId);
    if (item.quantidade_conferida != null) {
      throw new ConflictError('Um item já conferido não pode ser removido');
    }

    const itensRestantes = (await this.repo.listItens(id)).filter((i) => i.id !== itemId);
    if (itensRestantes.length === 0) {
      throw new ConflictError('O recebimento deve manter pelo menos um item');
    }

    await this.repo.deleteItem(itemId);
    await writeAuditLog({
      userId,
      action: 'DELETE',
      entity: 'recebimento_itens',
      entityId: itemId,
      changes: { before: item },
      ip,
    });
    return { ...recebimento, itens: itensRestantes };
  }

  async iniciarConferencia(
    id: string,
    userId: string | null,
    ip: string | null,
  ): Promise<Recebimento> {
    const recebimento = await this.repo.findById(id);
    if (!recebimento) throw new NotFoundError('recebimento', id);
    this.assertTransicao(recebimento.status, 'EM_CONFERENCIA');

    const updated = await this.repo.updateIfStatus(id, recebimento.status, {
      status: 'EM_CONFERENCIA',
    });
    if (!updated)
      throw new ConflictError('O recebimento foi alterado por outro usuário; recarregue e tente novamente.');
    await writeAuditLog({
      userId,
      action: 'STATUS_CHANGE',
      entity: 'recebimentos',
      entityId: id,
      changes: { before: recebimento.status, after: updated.status },
      ip,
    });
    return updated;
  }

  /** Confere um item (quantidade x esperada) e o endereça no armazém — gera uma movimentação RECEBIMENTO no ledger. */
  async conferirItem(
    recebimentoId: string,
    itemId: string,
    input: ConferirRecebimentoItemInput,
    userId: string | null,
    ip: string | null,
  ) {
    const recebimento = await this.repo.findById(recebimentoId);
    if (!recebimento) throw new NotFoundError('recebimento', recebimentoId);
    if (recebimento.status !== 'EM_CONFERENCIA') {
      throw new InvalidStateTransitionError(recebimento.status ?? 'AGUARDANDO', 'CONFERIDO_ITEM');
    }

    const item = await this.repo.findItemById(itemId);
    if (!item || item.recebimento_id !== recebimentoId) {
      throw new NotFoundError('recebimento_item', itemId);
    }
    // Um item só é conferido uma vez: reconferir geraria uma 2ª movimentação
    // RECEBIMENTO e dobraria o saldo em `estoque`.
    if (item.quantidade_conferida != null) {
      throw new ConflictError('Este item do recebimento já foi conferido');
    }
    const endereco = await this.enderecosRepo.findById(input.endereco_id);
    if (!endereco) throw new NotFoundError('endereco_armazem', input.endereco_id);

    const divergente = input.quantidade_conferida !== item.quantidade_esperada;
    const updatedItem = await this.repo.claimItemConferencia(itemId, {
      quantidade_conferida: input.quantidade_conferida,
      endereco_id: input.endereco_id,
      divergente,
      observacoes: input.observacoes ?? null,
    });
    if (!updatedItem) throw new ConflictError('Este item do recebimento já foi conferido');

    if (input.quantidade_conferida > 0) {
      await this.estoqueRepo.registrarMovimentacao(
        {
          produto_id: item.produto_id,
          tipo_movimentacao: 'RECEBIMENTO',
          quantidade: input.quantidade_conferida,
          endereco_destino_id: input.endereco_id,
          recebimento_id: recebimentoId,
          referencia_documento: recebimento.referencia_documento ?? undefined,
        },
        userId,
      );
      if (endereco.status !== 'BLOQUEADO') {
        await this.enderecosRepo.updateStatus(input.endereco_id, 'OCUPADO');
      }
    }

    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'recebimento_itens',
      entityId: itemId,
      changes: { before: item, after: updatedItem },
      ip,
    });
    return updatedItem;
  }

  /** Conclui a conferência: DIVERGENTE se algum item divergiu, ENDERECADO se todos os itens foram conferidos e endereçados, CONFERIDO caso contrário. */
  async concluirConferencia(
    id: string,
    userId: string | null,
    ip: string | null,
  ): Promise<RecebimentoDetalhe> {
    const recebimento = await this.repo.findById(id);
    if (!recebimento) throw new NotFoundError('recebimento', id);
    if (recebimento.status !== 'EM_CONFERENCIA') {
      throw new InvalidStateTransitionError(
        recebimento.status ?? 'AGUARDANDO',
        'CONFERIDO/ENDERECADO/DIVERGENTE',
      );
    }
    const itens = await this.repo.listItens(id);
    if (itens.some((i) => i.quantidade_conferida == null)) {
      throw new InvalidStateTransitionError(
        recebimento.status ?? 'AGUARDANDO',
        'CONFERIDO (itens pendentes de conferência)',
      );
    }

    const algumDivergente = itens.some((i) => i.divergente);
    const todosEnderecados = itens.every((i) => i.endereco_id != null);
    const novoStatus = algumDivergente
      ? 'DIVERGENTE'
      : todosEnderecados
        ? 'ENDERECADO'
        : 'CONFERIDO';

    const updated = await this.repo.updateIfStatus(id, recebimento.status, {
      status: novoStatus,
      data_recebimento: new Date().toISOString(),
    });
    if (!updated)
      throw new ConflictError('O recebimento foi alterado por outro usuário; recarregue e tente novamente.');
    await writeAuditLog({
      userId,
      action: 'STATUS_CHANGE',
      entity: 'recebimentos',
      entityId: id,
      changes: { before: recebimento.status, after: updated.status },
      ip,
    });
    return { ...updated, itens };
  }
}
