import { z } from 'zod';

/**
 * Saldo MATERIALIZADO de estoque (produto x endereço) — NUNCA a fonte da
 * verdade. É recalculado/reconciliado a partir do ledger
 * `movimentacoes_estoque` (ver nota de modelagem na migration 0006).
 */
export const EstoqueSchema = z.object({
  id: z.string().uuid(),
  produto_id: z.string().uuid(),
  endereco_id: z.string().uuid(),
  quantidade: z.number().nonnegative(),
  reconciliado_em: z.string().datetime().nullable().optional(),
  updated_at: z.string().datetime().optional(),
});
export type Estoque = z.infer<typeof EstoqueSchema>;
