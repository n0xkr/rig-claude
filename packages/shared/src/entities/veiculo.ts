import { z } from "zod";
import { TipoVeiculoSchema } from "../enums.js";

export const VeiculoSchema = z.object({
  id: z.string().uuid(),
  placa: z.string().min(6).max(8),
  tipo: TipoVeiculoSchema,
  marca: z.string().nullable().optional(),
  modelo: z.string().nullable().optional(),
  ano_fabricacao: z.number().int().gte(1980).lte(2100).nullable().optional(),
  frota_propria: z.boolean().default(true),
  capacidade_kg: z.number().nonnegative().nullable().optional(),
  rastreador_autotrac_id: z.string().nullable().optional(),
  ativo: z.boolean().default(true),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type Veiculo = z.infer<typeof VeiculoSchema>;

export const CreateVeiculoSchema = VeiculoSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});
export type CreateVeiculoInput = z.infer<typeof CreateVeiculoSchema>;

export const UpdateVeiculoSchema = CreateVeiculoSchema.partial();
export type UpdateVeiculoInput = z.infer<typeof UpdateVeiculoSchema>;
