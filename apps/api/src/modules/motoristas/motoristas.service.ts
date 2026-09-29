import type { CreateMotoristaInput, Motorista, UpdateMotoristaInput } from '@rigabras/shared';
import { MotoristasRepository } from './motoristas.repository.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

export class MotoristasService {
  constructor(private readonly repo: MotoristasRepository = new MotoristasRepository()) {}

  list(limit: number, cursor?: string) {
    return this.repo.list(limit, cursor);
  }

  async getById(id: string): Promise<Motorista> {
    const motorista = await this.repo.findById(id);
    if (!motorista) throw new NotFoundError('motorista', id);
    return motorista;
  }

  async create(
    input: CreateMotoristaInput,
    userId: string | null,
    ip: string | null,
  ): Promise<Motorista> {
    if (input.cpf) {
      const existing = await this.repo.findByCpf(input.cpf);
      if (existing) throw new ConflictError(`Já existe um motorista com o CPF ${input.cpf}`);
    }
    const created = await this.repo.create(input);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'motoristas',
      entityId: created.id,
      changes: { after: created },
      ip,
    });
    return created;
  }

  async update(
    id: string,
    input: UpdateMotoristaInput,
    userId: string | null,
    ip: string | null,
  ): Promise<Motorista> {
    const before = await this.getById(id);
    const updated = await this.repo.update(id, input);
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'motoristas',
      entityId: id,
      changes: { before, after: updated },
      ip,
    });
    return updated;
  }

  async softDelete(id: string, userId: string | null, ip: string | null): Promise<void> {
    const motorista = await this.getById(id);
    const viagensAtivas = await this.repo.countViagensAtivas(id);
    if (viagensAtivas > 0) {
      throw new ConflictError(
        `Motorista ${motorista.nome_completo} está em ${viagensAtivas} viagem(ns) em andamento; encerre ou cancele antes de removê-lo`,
      );
    }
    await this.repo.softDelete(id);
    await writeAuditLog({
      userId,
      action: 'DELETE',
      entity: 'motoristas',
      entityId: id,
      changes: null,
      ip,
    });
  }
}
