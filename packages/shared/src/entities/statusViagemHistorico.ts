import { z } from 'zod';
import { StatusViagemSchema } from '../enums.js';

/**
 * Linha do histórico de transições de status de uma viagem (Módulo 2,
 * critério #1 — máquina de estados explícita + trilha de auditoria).
 */
export const StatusViagemHistoricoSchema = z.object({
  id: z.string().uuid(),
  viagem_id: z.string().uuid(),
  status_anterior: StatusViagemSchema.nullable(),
  status_novo: StatusViagemSchema,
  changed_by: z.string().uuid().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  created_at: z.string().datetime().optional(),
});
export type StatusViagemHistorico = z.infer<typeof StatusViagemHistoricoSchema>;
