import { z } from 'zod';
import { TipoLancamentoFreteSchema } from '../enums.js';

/**
 * Lançamento individual de adiantamento, desconto ou multa sobre um frete
 * (Módulo 3, critério #3 — usado no cálculo do saldo do frete).
 */
export const FreteLancamentoSchema = z.object({
  id: z.string().uuid(),
  frete_id: z.string().uuid(),
  tipo: TipoLancamentoFreteSchema,
  valor: z.number().positive(),
  descricao: z.string().nullable().optional(),
  data_lancamento: z.string().date().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type FreteLancamento = z.infer<typeof FreteLancamentoSchema>;

export const CreateFreteLancamentoSchema = z.object({
  tipo: TipoLancamentoFreteSchema,
  valor: z.number().positive().max(9_999_999_999.99), // numeric(12,2)
  descricao: z.string().nullable().optional(),
  data_lancamento: z.string().date().optional(),
});
export type CreateFreteLancamentoInput = z.infer<typeof CreateFreteLancamentoSchema>;
