import type { ApoliceSeguro, CreateApoliceSeguroInput, UpdateApoliceSeguroInput } from "@rigabras/shared";
import { ApolicesRepository } from "./apolices.repository.js";
import { NotFoundError } from "../../lib/errors.js";
import { writeAuditLog } from "../../lib/auditLog.js";

export class ApolicesService {
  constructor(private readonly repo: ApolicesRepository = new ApolicesRepository()) {}

  list(limit: number, cursor?: string) {
    return this.repo.list(limit, cursor);
  }

  async getById(id: string): Promise<ApoliceSeguro> {
    const apolice = await this.repo.findById(id);
    if (!apolice) throw new NotFoundError("apolice_seguro", id);
    return apolice;
  }

  async create(input: CreateApoliceSeguroInput, userId: string | null, ip: string | null): Promise<ApoliceSeguro> {
    const created = await this.repo.create(input);
    await writeAuditLog({ userId, action: "CREATE", entity: "apolices_seguro", entityId: created.id, changes: { after: created }, ip });
    return created;
  }

  async update(id: string, input: UpdateApoliceSeguroInput, userId: string | null, ip: string | null): Promise<ApoliceSeguro> {
    const before = await this.getById(id);
    const updated = await this.repo.update(id, input);
    await writeAuditLog({ userId, action: "UPDATE", entity: "apolices_seguro", entityId: id, changes: { before, after: updated }, ip });
    return updated;
  }

  async softDelete(id: string, userId: string | null, ip: string | null): Promise<void> {
    await this.getById(id);
    await this.repo.softDelete(id);
    await writeAuditLog({ userId, action: "DELETE", entity: "apolices_seguro", entityId: id, changes: null, ip });
  }
}
