import { z } from 'zod';
import { StatusInventarioSchema } from '../enums.js';

/** Item de contagem de um inventário — saldo do sistema (ledger) x contado fisicamente (Módulo 5, critério "Controle de Inventário"). */
export const InventarioItemSchema = z.object({
  id: z.string().uuid(),
  inventario_id: z.string().uuid(),
  produto_id: z.string().uuid(),
  endereco_id: z.string().uuid(),
  quantidade_sistema: z.number().nonnegative(),
  quantidade_contada: z.number().nonnegative().nullable().optional(),
  ajustado: z.boolean().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
});
export type InventarioItem = z.infer<typeof InventarioItemSchema>;

/** Cabeçalho de um inventário/contagem física, aberto para um armazém. */
export const InventarioSchema = z.object({
  id: z.string().uuid(),
  armazem_id: z.string().uuid(),
  status: StatusInventarioSchema.optional(),
  data_abertura: z.string().datetime().optional(),
  data_encerramento: z.string().datetime().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type Inventario = z.infer<typeof InventarioSchema>;

export const CreateInventarioSchema = z.object({
  armazem_id: z.string().uuid(),
  observacoes: z.string().nullable().optional(),
});
export type CreateInventarioInput = z.infer<typeof CreateInventarioSchema>;

/** Uma linha de contagem física registrada para um item do inventário. */
export const ContarInventarioItemSchema = z.object({
  produto_id: z.string().uuid(),
  endereco_id: z.string().uuid(),
  quantidade_contada: z.number().nonnegative(),
});
export type ContarInventarioItemInput = z.infer<typeof ContarInventarioItemSchema>;

export const InventarioDetalheSchema = InventarioSchema.extend({
  itens: z.array(InventarioItemSchema),
});
export type InventarioDetalhe = z.infer<typeof InventarioDetalheSchema>;

/** Um ajuste gerado pela reconciliação do inventário (critério "cria lançamentos de ajuste no ledger para discrepâncias"). */
export const AjusteInventarioSchema = z.object({
  produto_id: z.string().uuid(),
  endereco_id: z.string().uuid(),
  quantidade_sistema: z.number(),
  quantidade_contada: z.number(),
  divergencia: z.number(),
});
export type AjusteInventario = z.infer<typeof AjusteInventarioSchema>;
