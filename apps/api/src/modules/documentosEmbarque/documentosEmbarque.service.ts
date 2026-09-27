import type {
  CreateDocumentoEmbarqueInput,
  DocumentoEmbarque,
  UpdateDocumentoEmbarqueInput,
} from '@rigabras/shared';
import { DocumentosEmbarqueRepository } from './documentosEmbarque.repository.js';
import { NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

/** CRUD de documentos de embarque (CRT, MIC/DTA, Fatura, DU-E, DUIMP) de uma viagem. */
export class DocumentosEmbarqueService {
  constructor(
    private readonly repo: DocumentosEmbarqueRepository = new DocumentosEmbarqueRepository(),
  ) {}

  listByViagem(viagemId: string): Promise<DocumentoEmbarque[]> {
    return this.repo.listByViagem(viagemId);
  }

  async getById(id: string): Promise<DocumentoEmbarque> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new NotFoundError('documento_embarque', id);
    return doc;
  }

  async create(
    input: CreateDocumentoEmbarqueInput,
    userId: string | null,
    ip: string | null,
  ): Promise<DocumentoEmbarque> {
    const created = await this.repo.create(input);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'documentos_embarque',
      entityId: created.id,
      changes: { after: created },
      ip,
    });
    return created;
  }

  async update(
    id: string,
    input: UpdateDocumentoEmbarqueInput,
    userId: string | null,
    ip: string | null,
  ): Promise<DocumentoEmbarque> {
    const before = await this.getById(id);
    const updated = await this.repo.update(id, input);
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'documentos_embarque',
      entityId: id,
      changes: { before, after: updated },
      ip,
    });
    return updated;
  }

  async validar(id: string, userId: string | null, ip: string | null): Promise<DocumentoEmbarque> {
    await this.getById(id);
    const updated = await this.repo.validar(id, userId);
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'documentos_embarque',
      entityId: id,
      changes: { validado: true },
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
      entity: 'documentos_embarque',
      entityId: id,
      changes: null,
      ip,
    });
  }
}
