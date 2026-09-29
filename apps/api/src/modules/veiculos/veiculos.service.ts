import type { CreateVeiculoInput, UpdateVeiculoInput, Veiculo } from '@rigabras/shared';
import { VeiculosRepository } from './veiculos.repository.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

export class VeiculosService {
  constructor(private readonly repo: VeiculosRepository = new VeiculosRepository()) {}

  list(limit: number, cursor?: string) {
    return this.repo.list(limit, cursor);
  }

  async getById(id: string): Promise<Veiculo> {
    const veiculo = await this.repo.findById(id);
    if (!veiculo) throw new NotFoundError('veiculo', id);
    return veiculo;
  }

  async create(
    rawInput: CreateVeiculoInput,
    userId: string | null,
    ip: string | null,
  ): Promise<Veiculo> {
    // Placa sempre em maiúsculas: `veiculos.placa` é unique e FK de `viagens.placa_cavalo`, ambos case-sensitive.
    const input = { ...rawInput, placa: rawInput.placa.trim().toUpperCase() };
    const existing = await this.repo.findByPlaca(input.placa);
    if (existing) throw new ConflictError(`Já existe um veículo com a placa ${input.placa}`);
    const created = await this.repo.create(input);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'veiculos',
      entityId: created.id,
      changes: { after: created },
      ip,
    });
    return created;
  }

  async update(
    id: string,
    rawInput: UpdateVeiculoInput,
    userId: string | null,
    ip: string | null,
  ): Promise<Veiculo> {
    const input = rawInput.placa
      ? { ...rawInput, placa: rawInput.placa.trim().toUpperCase() }
      : rawInput;
    const before = await this.getById(id);
    const updated = await this.repo.update(id, input);
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'veiculos',
      entityId: id,
      changes: { before, after: updated },
      ip,
    });
    return updated;
  }

  async softDelete(id: string, userId: string | null, ip: string | null): Promise<void> {
    const veiculo = await this.getById(id);
    const viagensAtivas = await this.repo.countViagensAtivas(id, veiculo.placa);
    if (viagensAtivas > 0) {
      throw new ConflictError(
        `Veículo ${veiculo.placa} está em ${viagensAtivas} viagem(ns) em andamento; encerre ou cancele antes de removê-lo`,
      );
    }
    await this.repo.softDelete(id);
    await writeAuditLog({
      userId,
      action: 'DELETE',
      entity: 'veiculos',
      entityId: id,
      changes: null,
      ip,
    });
  }
}
