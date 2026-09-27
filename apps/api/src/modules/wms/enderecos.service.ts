import type {
  CreateEnderecoArmazemInput,
  EnderecoArmazem,
  UpdateEnderecoArmazemInput,
} from '@rigabras/shared';
import { EnderecosRepository, type ListEnderecosFilter } from './enderecos.repository.js';
import { NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

export class EnderecosService {
  constructor(private readonly repo: EnderecosRepository = new EnderecosRepository()) {}

  list(filter: ListEnderecosFilter) {
    return this.repo.list(filter);
  }

  listArmazens() {
    return this.repo.listArmazens();
  }

  async getById(id: string): Promise<EnderecoArmazem> {
    const endereco = await this.repo.findById(id);
    if (!endereco) throw new NotFoundError('endereco_armazem', id);
    return endereco;
  }

  async create(
    input: CreateEnderecoArmazemInput,
    userId: string | null,
    ip: string | null,
  ): Promise<EnderecoArmazem> {
    const armazem = await this.repo.findArmazemById(input.armazem_id);
    if (!armazem) throw new NotFoundError('armazem', input.armazem_id);

    const created = await this.repo.create(input);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'enderecos_armazem',
      entityId: created.id,
      changes: { after: created },
      ip,
    });
    return created;
  }

  async update(
    id: string,
    input: UpdateEnderecoArmazemInput,
    userId: string | null,
    ip: string | null,
  ): Promise<EnderecoArmazem> {
    const before = await this.getById(id);
    const updated = await this.repo.update(id, input);
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'enderecos_armazem',
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
      entity: 'enderecos_armazem',
      entityId: id,
      changes: null,
      ip,
    });
  }
}
