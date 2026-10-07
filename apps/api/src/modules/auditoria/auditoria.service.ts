import { AuditoriaRepository, type ListAuditLogsFilter } from './auditoria.repository.js';

export class AuditoriaService {
  constructor(private readonly repo: AuditoriaRepository = new AuditoriaRepository()) {}

  list(filter: ListAuditLogsFilter) {
    return this.repo.list(filter);
  }
}
