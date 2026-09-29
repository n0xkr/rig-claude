import type {
  CreateFreteInput,
  CreateFreteLancamentoInput,
  CreatePagamentoFreteInput,
  Frete,
  FreteLancamento,
  PagamentoFrete,
  SaldoFrete,
  StatusFechamentoFrete,
  StatusFreteHistorico,
  UpdateFreteInput,
  UserRole,
} from '@rigabras/shared';
import {
  PAPEIS_TRANSICAO_FECHAMENTO_FRETE,
  TRANSICOES_STATUS_FECHAMENTO_FRETE,
} from '@rigabras/shared';
import { FretesRepository, type ListFretesFilter } from './fretes.repository.js';
import { ViagensRepository } from '../viagens/viagens.repository.js';
import {
  ConflictError,
  DomainError,
  ForbiddenTransitionError,
  InvalidStateTransitionError,
  NotFoundError,
} from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

/** Status de viagem que habilitam a abertura do fechamento financeiro do frete (critério: "tied to the existing viagens entity"). */
const STATUS_VIAGEM_ELEGIVEIS_PARA_FRETE = new Set(['ENTREGUE', 'ENCERRADA']);

/** Status de frete em que o cabeçalho comercial ainda pode ser editado. */
const STATUS_FRETE_EDITAVEIS = new Set<StatusFechamentoFrete>([
  'ABERTO',
  'EM_CONFERENCIA',
  'REJEITADO',
]);

/**
 * Serviço de Controle Financeiro do Frete (Módulo 3): frete contratado,
 * fechamento da viagem (máquina de estados ABERTO -> EM_CONFERENCIA ->
 * APROVADO -> PAGO, com REJEITADO como retrabalho), saldo do frete e frete
 * de retorno vazio. Regras de negócio isoladas aqui, fora da camada HTTP
 * (critério #1).
 */
export class FretesService {
  constructor(
    private readonly repo: FretesRepository = new FretesRepository(),
    private readonly viagensRepo: ViagensRepository = new ViagensRepository(),
  ) {}

  list(filter: ListFretesFilter) {
    return this.repo.list(filter);
  }

  async getById(id: string): Promise<Frete> {
    const frete = await this.repo.findById(id);
    if (!frete) throw new NotFoundError('frete', id);
    return frete;
  }

  async getByViagemId(viagemId: string): Promise<Frete> {
    const frete = await this.repo.findByViagemId(viagemId);
    if (!frete) throw new NotFoundError('frete', viagemId);
    return frete;
  }

  async create(input: CreateFreteInput, userId: string | null, ip: string | null): Promise<Frete> {
    const viagem = await this.viagensRepo.findById(input.viagem_id);
    if (!viagem) throw new NotFoundError('viagem', input.viagem_id);
    if (!STATUS_VIAGEM_ELEGIVEIS_PARA_FRETE.has(viagem.status)) {
      throw new DomainError(
        'Viagem não elegível para fechamento financeiro',
        422,
        `A viagem precisa estar ENTREGUE ou ENCERRADA para abrir o fechamento do frete (status atual: ${viagem.status})`,
      );
    }
    const existing = await this.repo.findByViagemId(input.viagem_id);
    if (existing) {
      throw new ConflictError(`Já existe um frete cadastrado para a viagem ${input.viagem_id}`);
    }

    const created = await this.repo.create(input, userId);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'fretes',
      entityId: created.id,
      changes: { after: created },
      ip,
    });
    return created;
  }

  async update(
    id: string,
    input: UpdateFreteInput,
    userId: string | null,
    ip: string | null,
  ): Promise<Frete> {
    const before = await this.getById(id);
    if (!STATUS_FRETE_EDITAVEIS.has(before.status_fechamento)) {
      throw new ConflictError(
        `Frete no status "${before.status_fechamento}" não pode mais ser editado`,
      );
    }
    // Mesma regra da criação (frete de retorno com backhaul exige valor), aplicada ao resultado do merge.
    const merged = { ...before, ...input };
    if (!merged.retorno_vazio && !merged.valor_frete_retorno) {
      throw new DomainError(
        'Frete de retorno incompleto',
        422,
        'valor_frete_retorno é obrigatório quando retorno_vazio = false (há carga de backhaul)',
      );
    }
    if (Object.keys(input).length === 0) return before; // PATCH vazio: nada a atualizar (o PostgREST rejeita UPDATE sem colunas)
    const updated = await this.repo.update(id, input);
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'fretes',
      entityId: id,
      changes: { before, after: updated },
      ip,
    });
    return updated;
  }

  /**
   * Aplica a máquina de estados explícita do fechamento da viagem (critério
   * #1 do Módulo 3): ABERTO -> EM_CONFERENCIA (conferência operacional) ->
   * APROVADO (aprovação financeira) -> PAGO (pagamento), com REJEITADO como
   * retrabalho de volta a EM_CONFERENCIA. Transições inexistentes no grafo
   * retornam 422; transições existentes mas fora do papel do usuário
   * retornam 403 (critério #4 — RBAC granular por transição, ex: só
   * ADMIN/SUPERADMIN aprovam financeiramente). A transição para PAGO exige
   * saldo do frete <= 0 (totalmente quitado).
   */
  async changeStatus(
    id: string,
    nextStatus: StatusFechamentoFrete,
    userId: string | null,
    userRole: UserRole,
    ip: string | null,
    observacoes?: string | null,
  ): Promise<Frete> {
    const current = await this.getById(id);
    const allowed = TRANSICOES_STATUS_FECHAMENTO_FRETE[current.status_fechamento];
    if (!allowed.includes(nextStatus)) {
      throw new InvalidStateTransitionError(current.status_fechamento, nextStatus);
    }

    const allowedRoles = PAPEIS_TRANSICAO_FECHAMENTO_FRETE[current.status_fechamento][nextStatus];
    if (!allowedRoles?.includes(userRole)) {
      throw new ForbiddenTransitionError(
        `A transição de "${current.status_fechamento}" para "${nextStatus}" requer um dos papéis: ${(allowedRoles ?? []).join(', ')}`,
      );
    }

    if (nextStatus === 'PAGO') {
      const saldo = await this.computeSaldo(id);
      if (saldo.saldo > 0) {
        throw new DomainError(
          'Saldo do frete ainda pendente',
          422,
          `Não é possível concluir o pagamento: saldo em aberto de ${saldo.saldo.toFixed(2)}`,
        );
      }
    }

    const now = new Date().toISOString();
    const patch: Parameters<FretesRepository['updateStatus']>[1] = {
      status_fechamento: nextStatus,
    };
    if (nextStatus === 'APROVADO') {
      patch.aprovado_por = userId;
      patch.aprovado_em = now;
    }
    if (nextStatus === 'PAGO') {
      patch.pago_por = userId;
      patch.pago_em = now;
    }

    const updated = await this.repo.updateStatus(id, patch);
    await this.repo.insertStatusHistory({
      freteId: id,
      statusAnterior: current.status_fechamento,
      statusNovo: nextStatus,
      changedBy: userId,
      observacoes: observacoes ?? null,
    });
    await writeAuditLog({
      userId,
      action: 'STATUS_CHANGE',
      entity: 'fretes',
      entityId: id,
      changes: { from: current.status_fechamento, to: nextStatus },
      ip,
    });
    return updated;
  }

  async getStatusHistory(id: string): Promise<StatusFreteHistorico[]> {
    await this.getById(id);
    return this.repo.listStatusHistory(id);
  }

  /**
   * Saldo do frete (critério #3): frete contratado menos adiantamentos,
   * descontos e multas lançados, menos pagamentos já confirmados — "o que
   * ainda é devido". Sempre calculado a partir das linhas de origem (nunca
   * de uma coluna persistida), para nunca ficar desatualizado.
   */
  async computeSaldo(id: string): Promise<SaldoFrete> {
    const frete = await this.getById(id);
    const [lancamentos, pagamentos] = await Promise.all([
      this.repo.listLancamentos(id),
      this.repo.listPagamentos(id),
    ]);

    const totalPorTipo = (tipo: FreteLancamento['tipo']) =>
      round2(lancamentos.filter((l) => l.tipo === tipo).reduce((acc, l) => acc + l.valor, 0));
    const totalAdiantamentos = totalPorTipo('ADIANTAMENTO');
    const totalDescontos = totalPorTipo('DESCONTO');
    const totalMultas = totalPorTipo('MULTA');
    const totalPagoConfirmado = round2(
      pagamentos.filter((p) => p.status === 'CONFIRMADO').reduce((acc, p) => acc + p.valor_pago, 0),
    );

    const saldo = round2(
      frete.valor_contratado -
        totalAdiantamentos -
        totalDescontos -
        totalMultas -
        totalPagoConfirmado,
    );

    return {
      frete_id: id,
      valor_contratado: frete.valor_contratado,
      total_adiantamentos: totalAdiantamentos,
      total_descontos: totalDescontos,
      total_multas: totalMultas,
      total_pago_confirmado: totalPagoConfirmado,
      saldo,
    };
  }

  async softDelete(id: string, userId: string | null, ip: string | null): Promise<void> {
    await this.getById(id);
    await this.repo.softDelete(id);
    await writeAuditLog({
      userId,
      action: 'DELETE',
      entity: 'fretes',
      entityId: id,
      changes: null,
      ip,
    });
  }

  async listLancamentos(freteId: string): Promise<FreteLancamento[]> {
    await this.getById(freteId);
    return this.repo.listLancamentos(freteId);
  }

  async createLancamento(
    freteId: string,
    input: CreateFreteLancamentoInput,
    userId: string | null,
    ip: string | null,
  ): Promise<FreteLancamento> {
    const frete = await this.getById(freteId);
    if (frete.status_fechamento === 'PAGO') {
      throw new ConflictError('Não é possível lançar adiantamento/desconto/multa em frete já pago');
    }
    const created = await this.repo.createLancamento(freteId, input, userId);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'frete_lancamentos',
      entityId: created.id,
      changes: { after: created },
      ip,
    });
    return created;
  }

  async softDeleteLancamento(
    freteId: string,
    lancamentoId: string,
    userId: string | null,
    ip: string | null,
  ): Promise<void> {
    await this.getById(freteId);
    const lancamento = await this.repo.findLancamentoById(lancamentoId);
    if (!lancamento || lancamento.frete_id !== freteId) {
      throw new NotFoundError('frete_lancamento', lancamentoId);
    }
    await this.repo.softDeleteLancamento(lancamentoId);
    await writeAuditLog({
      userId,
      action: 'DELETE',
      entity: 'frete_lancamentos',
      entityId: lancamentoId,
      changes: null,
      ip,
    });
  }

  async listPagamentos(freteId: string): Promise<PagamentoFrete[]> {
    await this.getById(freteId);
    return this.repo.listPagamentos(freteId);
  }

  async createPagamento(
    freteId: string,
    input: CreatePagamentoFreteInput,
    userId: string | null,
    ip: string | null,
  ): Promise<PagamentoFrete> {
    const frete = await this.getById(freteId);
    if (frete.status_fechamento !== 'APROVADO') {
      throw new ConflictError(
        `Pagamentos só podem ser registrados após a aprovação financeira do frete (status atual: ${frete.status_fechamento})`,
      );
    }
    const created = await this.repo.createPagamento(freteId, input, userId);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'pagamentos_frete',
      entityId: created.id,
      changes: { after: created },
      ip,
    });
    return created;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
