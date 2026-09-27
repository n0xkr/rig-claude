import type { CreateEventoRiscoInput, EventoRisco, UpdateEventoRiscoInput } from '@rigabras/shared';
import { EventosRiscoRepository } from './eventosRisco.repository.js';
import { NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

export class EventosRiscoService {
  constructor(private readonly repo: EventosRiscoRepository = new EventosRiscoRepository()) {}

  listByViagem(viagemId: string) {
    return this.repo.listByViagem(viagemId);
  }

  async getById(id: string): Promise<EventoRisco> {
    const evento = await this.repo.findById(id);
    if (!evento) throw new NotFoundError('evento_risco', id);
    return evento;
  }

  async create(
    input: CreateEventoRiscoInput,
    userId: string | null,
    ip: string | null,
  ): Promise<EventoRisco> {
    const created = await this.repo.create(input, userId);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'eventos_risco',
      entityId: created.id,
      changes: { after: created },
      ip,
    });
    return created;
  }

  async update(
    id: string,
    input: UpdateEventoRiscoInput,
    userId: string | null,
    ip: string | null,
  ): Promise<EventoRisco> {
    const before = await this.getById(id);
    const updated = await this.repo.update(id, input);
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'eventos_risco',
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
      entity: 'eventos_risco',
      entityId: id,
      changes: null,
      ip,
    });
  }
}
