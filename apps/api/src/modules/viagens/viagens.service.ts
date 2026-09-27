import type { CreateViagemInput, UpdateViagemInput, Viagem } from '@rigabras/shared';
import { TRANSICOES_STATUS_VIAGEM, type StatusViagem } from '@rigabras/shared';
import { ViagensRepository, type ListViagensFilter } from './viagens.repository.js';
import { ConflictError, InvalidStateTransitionError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

export class ViagensService {
  constructor(private readonly repo: ViagensRepository = new ViagensRepository()) {}

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
   * Aplica a máquina de estados explícita da viagem (critério #1):
   * PROGRAMADA -> EM_COLETA -> EM_TRANSITO -> NA_FRONTEIRA -> ENTREGUE -> ENCERRADA
   * (com CANCELADA como saída em quase todos os estados).
   */
  async changeStatus(
    id: string,
    nextStatus: StatusViagem,
    userId: string | null,
    ip: string | null,
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
    await writeAuditLog({
      userId,
      action: 'STATUS_CHANGE',
      entity: 'viagens',
      entityId: id,
      changes: { from: current.status, to: nextStatus },
      ip,
    });
    return updated;
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
  EM_COLETA: 'data_coleta',
  EM_TRANSITO: 'data_inicio_viagem',
  NA_FRONTEIRA: 'data_chegada_fronteira',
  ENTREGUE: 'data_entrega',
  ENCERRADA: 'data_encerramento',
};
