import { z } from 'zod';
import { StatusEnderecoArmazemSchema } from '../enums.js';

/**
 * Endereço (bin) dentro do armazém coberto de 5.500 m² (ver
 * RIGABRAS_BASE_DE_CONHECIMENTO.md): área -> rua -> prateleira -> posição.
 */
export const EnderecoArmazemSchema = z.object({
  id: z.string().uuid(),
  armazem_id: z.string().uuid(),
  area: z.string().min(1),
  rua: z.string().min(1),
  prateleira: z.string().min(1),
  posicao: z.string().min(1),
  capacidade_m3: z.number().nonnegative().nullable().optional(),
  status: StatusEnderecoArmazemSchema.optional(),
  observacoes: z.string().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type EnderecoArmazem = z.infer<typeof EnderecoArmazemSchema>;

export const CreateEnderecoArmazemSchema = EnderecoArmazemSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});
export type CreateEnderecoArmazemInput = z.infer<typeof CreateEnderecoArmazemSchema>;

export const UpdateEnderecoArmazemSchema = CreateEnderecoArmazemSchema.omit({
  armazem_id: true,
}).partial();
export type UpdateEnderecoArmazemInput = z.infer<typeof UpdateEnderecoArmazemSchema>;
