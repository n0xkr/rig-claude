import { z } from 'zod';

/** Trilha de auditoria (critério #3/#21): toda ação relevante do sistema, já gravada por `writeAuditLog` em todos os módulos desde a migration 0001. */
export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  action: z.enum(['CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE']),
  entity: z.string(),
  entity_id: z.string().uuid().nullable().optional(),
  changes_json: z.record(z.unknown()).nullable().optional(),
  ip: z.string().nullable().optional(),
  created_at: z.string().datetime().optional(),
  user: z
    .object({ nome_completo: z.string(), email: z.string() })
    .nullable()
    .optional(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;
