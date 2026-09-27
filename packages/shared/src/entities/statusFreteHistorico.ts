import { z } from 'zod';
import { StatusFechamentoFreteSchema } from '../enums.js';

/**
 * Linha do histórico de transições de status de fechamento de um frete
 * (Módulo 3, critério #1 — máquina de estados explícita + trilha de
 * auditoria), no mesmo padrão de `StatusViagemHistorico` (Módulo 2).
 */
export const StatusFreteHistoricoSchema = z.object({
  id: z.string().uuid(),
  frete_id: z.string().uuid(),
  status_anterior: StatusFechamentoFreteSchema.nullable(),
  status_novo: StatusFechamentoFreteSchema,
  changed_by: z.string().uuid().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  created_at: z.string().datetime().optional(),
});
export type StatusFreteHistorico = z.infer<typeof StatusFreteHistoricoSchema>;
