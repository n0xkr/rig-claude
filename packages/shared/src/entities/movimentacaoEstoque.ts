import { z } from 'zod';
import { TipoMovimentacaoEstoqueSchema } from '../enums.js';

/**
 * Uma linha imutável do ledger de estoque (Módulo 5, critério "Inventário
 * deve ser auditável, derivado do ledger"). Nunca editada após criada — uma
 * correção é sempre um novo evento (tipicamente AJUSTE_INVENTARIO), mesmo
 * racional de `registros_jornada` no Módulo 4.
 */
export const MovimentacaoEstoqueSchema = z.object({
  id: z.string().uuid(),
  produto_id: z.string().uuid(),
  tipo_movimentacao: TipoMovimentacaoEstoqueSchema,
  quantidade: z.number().positive(),
  endereco_origem_id: z.string().uuid().nullable().optional(),
  endereco_destino_id: z.string().uuid().nullable().optional(),
  recebimento_id: z.string().uuid().nullable().optional(),
  expedicao_id: z.string().uuid().nullable().optional(),
  inventario_id: z.string().uuid().nullable().optional(),
  referencia_documento: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
});
export type MovimentacaoEstoque = z.infer<typeof MovimentacaoEstoqueSchema>;

export const CreateMovimentacaoEstoqueSchema = MovimentacaoEstoqueSchema.omit({
  id: true,
  created_at: true,
  created_by: true,
});
export type CreateMovimentacaoEstoqueInput = z.infer<typeof CreateMovimentacaoEstoqueSchema>;
