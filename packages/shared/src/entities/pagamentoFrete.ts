import { z } from 'zod';
import { StatusPagamentoFreteSchema } from '../enums.js';

/**
 * Registro individual de pagamento dentro do ledger de pagamentos do frete
 * (Módulo 3, critério #2 — etapa "Pagamento" do fechamento da viagem).
 * Suporta pagamentos parciais: o saldo do frete é recalculado somando os
 * pagamentos com status CONFIRMADO.
 */
export const PagamentoFreteSchema = z.object({
  id: z.string().uuid(),
  frete_id: z.string().uuid(),
  valor_pago: z.number().positive(),
  data_pagamento: z.string().date().nullable().optional(),
  forma_pagamento: z.string().nullable().optional(),
  status: StatusPagamentoFreteSchema.default('PENDENTE'),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type PagamentoFrete = z.infer<typeof PagamentoFreteSchema>;

export const CreatePagamentoFreteSchema = z.object({
  valor_pago: z.number().positive(),
  data_pagamento: z.string().date().nullable().optional(),
  forma_pagamento: z.string().nullable().optional(),
  status: StatusPagamentoFreteSchema.default('CONFIRMADO'),
});
export type CreatePagamentoFreteInput = z.infer<typeof CreatePagamentoFreteSchema>;
