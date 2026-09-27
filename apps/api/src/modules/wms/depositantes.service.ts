import type { CreateDepositanteInput, Depositante, UpdateDepositanteInput } from '@rigabras/shared';
import { DepositantesRepository, type ListDepositantesFilter } from './depositantes.repository.js';
import { NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

export class DepositantesService {
  constructor(private readonly repo: DepositantesRepository = new DepositantesRepository()) {}

  list(filter: ListDepositantesFilter) {
    return this.repo.list(filter);
  }

  async getById(id: string): Promise<Depositante> {
    const depositante = await this.repo.findById(id);
    if (!depositante) throw new NotFoundError('depositante', id);
    return depositante;
  }

  async create(
    input: CreateDepositanteInput,
    userId: string | null,
    ip: string | null,
  ): Promise<Depositante> {
    const created = await this.repo.create(input, userId);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'depositantes',
      entityId: created.id,
      changes: { after: created },
      ip,
    });
    return created;
  }

  async update(
    id: string,
    input: UpdateDepositanteInput,
    userId: string | null,
    ip: string | null,
  ): Promise<Depositante> {
    const before = await this.getById(id);
    const updated = await this.repo.update(id, input);
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'depositantes',
      entityId: id,
      changes: { before, after: updated },
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
      entity: 'depositantes',
      entityId: id,
      changes: null,
      ip,
    });
  }
}
