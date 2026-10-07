import { z } from 'zod';

/** SKU cadastrado por depositante (Módulo 5, catálogo do Armazém Geral). */
export const ProdutoArmazenadoSchema = z.object({
  id: z.string().uuid(),
  depositante_id: z.string().uuid(),
  codigo: z.string().min(1),
  numero_produto: z.string().min(1).max(60).nullable().optional(),
  sku: z.string().min(1),
  descricao: z.string().min(1),
  unidade_medida: z.string().optional(),
  peso_kg: z.number().nonnegative().nullable().optional(),
  volume_m3: z.number().nonnegative().nullable().optional(),
  ativo: z.boolean().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type ProdutoArmazenado = z.infer<typeof ProdutoArmazenadoSchema>;

export const CreateProdutoArmazenadoSchema = ProdutoArmazenadoSchema.omit({
  id: true,
  codigo: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
  created_by: true,
});
export type CreateProdutoArmazenadoInput = z.infer<typeof CreateProdutoArmazenadoSchema>;

export const UpdateProdutoArmazenadoSchema = CreateProdutoArmazenadoSchema.omit({
  depositante_id: true,
}).partial();
export type UpdateProdutoArmazenadoInput = z.infer<typeof UpdateProdutoArmazenadoSchema>;
