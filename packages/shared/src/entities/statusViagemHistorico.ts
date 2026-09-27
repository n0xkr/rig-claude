import { z } from 'zod';
import { OrigemEventoViagemSchema, StatusViagemSchema } from '../enums.js';

/**
 * Linha do histórico de transições de status de uma viagem (Módulo 2,
 * critério #1 — máquina de estados explícita + trilha de auditoria).
 * `origem_evento` (Módulo 6) distingue uma transição real (`MANUAL`) de uma
 * nota informativa disparada pelo WMS (`WMS`) — ver migration 0007.
 */
export const StatusViagemHistoricoSchema = z.object({
  id: z.string().uuid(),
  viagem_id: z.string().uuid(),
  status_anterior: StatusViagemSchema.nullable(),
  status_novo: StatusViagemSchema,
  changed_by: z.string().uuid().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  origem_evento: OrigemEventoViagemSchema.optional(),
  created_at: z.string().datetime().optional(),
});
export type StatusViagemHistorico = z.infer<typeof StatusViagemHistoricoSchema>;
