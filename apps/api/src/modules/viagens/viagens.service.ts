import type {
  CreateViagemInput,
  UpdateViagemInput,
  Viagem,
  ViagemWmsStatus,
} from '@rigabras/shared';
import { TRANSICOES_STATUS_VIAGEM, type StatusViagem } from '@rigabras/shared';
import { ViagensRepository, type ListViagensFilter } from './viagens.repository.js';
import { ExpedicoesRepository } from '../wms/expedicoes.repository.js';
import { RecebimentosRepository } from '../wms/recebimentos.repository.js';
import { RecebimentosService } from '../wms/recebimentos.service.js';
import {
  ConflictError,
  DomainError,
  InvalidStateTransitionError,
  NotFoundError,
} from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

export class ViagensService {
  constructor(
    private readonly repo: ViagensRepository = new ViagensRepository(),
    private readonly expedicoesRepo: ExpedicoesRepository = new ExpedicoesRepository(),
    private readonly recebimentosRepo: RecebimentosRepository = new RecebimentosRepository(),
    private readonly recebimentosService: RecebimentosService = new RecebimentosService(),
  ) {}

  list(filter: ListViagensFilter) {
    return this.repo.list(filter);
  }

  async getById(id: string): Promise<Viagem> {
    const viagem = await this.repo.findById(id);
    if (!viagem) throw new NotFoundError('viagem', id);
    return viagem;
  }

  async create(
    input: CreateViagemInput,
    userId: string | null,
    ip: string | null,
  ): Promise<Viagem> {
    if (input.numero_crt) {
      const existing = await this.repo.findByCrt(input.numero_crt);
      if (existing) {
        throw new ConflictError(`Já existe uma viagem com o CRT ${input.numero_crt}`);
      }
    }
    const created = await this.repo.create(input, userId);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'viagens',
      entityId: created.id,
      changes: { after: created },
      ip,
    });
    return created;
  }

  async update(
    id: string,
    input: UpdateViagemInput,
    userId: string | null,
    ip: string | null,
  ): Promise<Viagem> {
    const before = await this.getById(id);
    const updated = await this.repo.update(id, input);
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'viagens',
      entityId: id,
      changes: { before, after: updated },
      ip,
    });
    return updated;
  }

  /**
   * Aplica a máquina de estados explícita da viagem (critério #1 do Módulo 2):
   * Programação -> Coleta -> Documentação -> Veículo/Motorista -> Validação ->
   * Viagem -> Monitoramento -> Entrega -> Encerramento (com CANCELADA como
   * saída em quase todos os estados). Transições inválidas são rejeitadas com
   * um Problem Details 422, e toda transição válida grava uma linha em
   * `status_viagem_historico` para fins de auditoria, além do audit_log geral.
   */
  async changeStatus(
    id: string,
    nextStatus: StatusViagem,
    userId: string | null,
    ip: string | null,
    observacoes?: string | null,
  ): Promise<Viagem> {
    const current = await this.getById(id);
    const allowed = TRANSICOES_STATUS_VIAGEM[current.status];
    if (!allowed.includes(nextStatus)) {
      throw new InvalidStateTransitionError(current.status, nextStatus);
    }

    const timestampField = STATUS_TIMESTAMP_FIELD[nextStatus];
    const patch: UpdateViagemInput = { status: nextStatus };
    if (timestampField) {
      (patch as Record<string, unknown>)[timestampField] = new Date().toISOString();
    }

    const updated = await this.repo.update(id, patch);
    await this.repo.insertStatusHistory({
      viagemId: id,
      statusAnterior: current.status,
      statusNovo: nextStatus,
      changedBy: userId,
      observacoes: observacoes ?? null,
    });
    await writeAuditLog({
      userId,
      action: 'STATUS_CHANGE',
      entity: 'viagens',
      entityId: id,
      changes: { from: current.status, to: nextStatus },
      ip,
    });

    if (nextStatus === 'ENTREGUE' && updated.destino_armazem_rigabras) {
      await this.sincronizarRecebimentoAutomatico(updated, userId, ip);
    }

    return updated;
  }

  /**
   * Módulo 6 (Integração TMS+WMS), critério "Entrega -> Recebimento": ao
   * confirmar a entrega de uma viagem com destino ao Armazém Rigabras,
   * tenta criar automaticamente o `recebimento` do Módulo 5 (ver
   * `RecebimentosService.criarAutomaticoDeViagem`). NUNCA bloqueia a
   * confirmação de entrega em si (a viagem já foi marcada ENTREGUE acima) —
   * tanto o sucesso quanto a falha da automação viram uma nota WMS na linha
   * do tempo da viagem, então nada acontece silenciosamente.
   */
  private async sincronizarRecebimentoAutomatico(
    viagem: Viagem,
    userId: string | null,
    ip: string | null,
  ): Promise<void> {
    try {
      const recebimento = await this.recebimentosService.criarAutomaticoDeViagem(
        viagem,
        userId,
        ip,
      );
      await this.repo.insertStatusHistory({
        viagemId: viagem.id,
        statusAnterior: viagem.status,
        statusNovo: viagem.status,
        changedBy: userId,
        observacoes: `[WMS] Recebimento ${recebimento.id} criado/localizado automaticamente no armazém a partir desta entrega.`,
        origemEvento: 'WMS',
      });
    } catch (error) {
      if (error instanceof DomainError) {
        await this.repo.insertStatusHistory({
          viagemId: viagem.id,
          statusAnterior: viagem.status,
          statusNovo: viagem.status,
          changedBy: userId,
          observacoes: `[WMS] Não foi possível criar o recebimento automaticamente: ${error.detail ?? error.message}`,
          origemEvento: 'WMS',
        });
        return;
      }
      throw error;
    }
  }

  /**
   * Módulo 6: status cruzado TMS+WMS de uma viagem — expedição e/ou
   * recebimento do armazém vinculados a ela, quando existirem.
   */
  async getWmsStatus(id: string): Promise<ViagemWmsStatus> {
    await this.getById(id);
    const [expedicao, recebimento] = await Promise.all([
      this.expedicoesRepo.findByViagemId(id),
      this.recebimentosRepo.findByViagemId(id),
    ]);
    return { viagem_id: id, expedicao, recebimento };
  }

  /** Histórico de transições de status da viagem (critério #1). */
  async getStatusHistory(id: string) {
    await this.getById(id);
    return this.repo.listStatusHistory(id);
  }

  async softDelete(id: string, userId: string | null, ip: string | null): Promise<void> {
    await this.getById(id);
    await this.repo.softDelete(id);
    await writeAuditLog({
      userId,
      action: 'DELETE',
      entity: 'viagens',
      entityId: id,
      changes: null,
      ip,
    });
  }
}

const STATUS_TIMESTAMP_FIELD: Partial<Record<StatusViagem, string>> = {
  AGUARDANDO_COLETA: 'data_ordem_coleta',
  EM_COLETA: 'data_coleta',
  EM_TRANSITO: 'data_inicio_viagem',
  NA_FRONTEIRA: 'data_chegada_fronteira',
  EM_MONITORAMENTO: 'data_liberacao_fronteira',
  ENTREGUE: 'data_entrega',
  ENCERRADA: 'data_encerramento',
};
