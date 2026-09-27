import type { CreateVeiculoInput, UpdateVeiculoInput, Veiculo } from "@rigabras/shared";
import { VeiculosRepository } from "./veiculos.repository.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { writeAuditLog } from "../../lib/auditLog.js";

export class VeiculosService {
  constructor(private readonly repo: VeiculosRepository = new VeiculosRepository()) {}

  list(limit: number, cursor?: string) {
    return this.repo.list(limit, cursor);
  }

  async getById(id: string): Promise<Veiculo> {
    const veiculo = await this.repo.findById(id);
    if (!veiculo) throw new NotFoundError("veiculo", id);
    return veiculo;
  }

  async create(input: CreateVeiculoInput, userId: string | null, ip: string | null): Promise<Veiculo> {
    const existing = await this.repo.findByPlaca(input.placa);
    if (existing) throw new ConflictError(`Já existe um veículo com a placa ${input.placa}`);
    const created = await this.repo.create(input);
    await writeAuditLog({ userId, action: "CREATE", entity: "veiculos", entityId: created.id, changes: { after: created }, ip });
    return created;
  }

  async update(id: string, input: UpdateVeiculoInput, userId: string | null, ip: string | null): Promise<Veiculo> {
    const before = await this.getById(id);
    const updated = await this.repo.update(id, input);
    await writeAuditLog({ userId, action: "UPDATE", entity: "veiculos", entityId: id, changes: { before, after: updated }, ip });
    return updated;
  }

  async softDelete(id: string, userId: string | null, ip: string | null): Promise<void> {
    await this.getById(id);
    await this.repo.softDelete(id);
    await writeAuditLog({ userId, action: "DELETE", entity: "veiculos", entityId: id, changes: null, ip });
  }
}
