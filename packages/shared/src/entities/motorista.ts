import { z } from "zod";

export const MotoristaSchema = z.object({
  id: z.string().uuid(),
  nome_completo: z.string().min(3).max(200),
  cpf: z.string().min(11).max(14).nullable().optional(),
  cnh: z.string().nullable().optional(),
  cnh_categoria: z.string().nullable().optional(),
  cnh_validade: z.string().date().nullable().optional(),
  telefone: z.string().nullable().optional(),
  frota_propria: z.boolean().default(true),
  ativo: z.boolean().default(true),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type Motorista = z.infer<typeof MotoristaSchema>;

export const CreateMotoristaSchema = MotoristaSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});
export type CreateMotoristaInput = z.infer<typeof CreateMotoristaSchema>;

export const UpdateMotoristaSchema = CreateMotoristaSchema.partial();
export type UpdateMotoristaInput = z.infer<typeof UpdateMotoristaSchema>;
