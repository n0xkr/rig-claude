import { z } from "zod";
import { TipoApoliceSchema } from "../enums.js";

export const ApoliceSeguroSchema = z
  .object({
    id: z.string().uuid(),
    tipo: TipoApoliceSchema,
    numero_apolice: z.string().min(2),
    seguradora: z.string().min(2),
    veiculo_id: z.string().uuid().nullable().optional(),
    viagem_id: z.string().uuid().nullable().optional(),
    valor_segurado: z.number().nonnegative().nullable().optional(),
    vigencia_inicio: z.string().date(),
    vigencia_fim: z.string().date(),
    ativa: z.boolean().default(true),
    observacoes: z.string().nullable().optional(),
    created_at: z.string().datetime().optional(),
    updated_at: z.string().datetime().nullable().optional(),
    deleted_at: z.string().datetime().nullable().optional(),
  })
  .refine((data) => data.vigencia_fim >= data.vigencia_inicio, {
    message: "vigencia_fim deve ser >= vigencia_inicio",
    path: ["vigencia_fim"],
  })
  .refine((data) => Boolean(data.veiculo_id) || Boolean(data.viagem_id), {
    message: "apólice deve estar vinculada a um veículo ou a uma viagem",
    path: ["veiculo_id"],
  });
export type ApoliceSeguro = z.infer<typeof ApoliceSeguroSchema>;

export const CreateApoliceSeguroSchema = z
  .object({
    tipo: TipoApoliceSchema,
    numero_apolice: z.string().min(2),
    seguradora: z.string().min(2),
    veiculo_id: z.string().uuid().nullable().optional(),
    viagem_id: z.string().uuid().nullable().optional(),
    valor_segurado: z.number().nonnegative().nullable().optional(),
    vigencia_inicio: z.string().date(),
    vigencia_fim: z.string().date(),
    ativa: z.boolean().default(true),
    observacoes: z.string().nullable().optional(),
  })
  .refine((data) => data.vigencia_fim >= data.vigencia_inicio, {
    message: "vigencia_fim deve ser >= vigencia_inicio",
    path: ["vigencia_fim"],
  })
  .refine((data) => Boolean(data.veiculo_id) || Boolean(data.viagem_id), {
    message: "apólice deve estar vinculada a um veículo ou a uma viagem",
    path: ["veiculo_id"],
  });
export type CreateApoliceSeguroInput = z.infer<typeof CreateApoliceSeguroSchema>;

export const UpdateApoliceSeguroSchema = z.object({
  tipo: TipoApoliceSchema.optional(),
  numero_apolice: z.string().min(2).optional(),
  seguradora: z.string().min(2).optional(),
  veiculo_id: z.string().uuid().nullable().optional(),
  viagem_id: z.string().uuid().nullable().optional(),
  valor_segurado: z.number().nonnegative().nullable().optional(),
  vigencia_inicio: z.string().date().optional(),
  vigencia_fim: z.string().date().optional(),
  ativa: z.boolean().optional(),
  observacoes: z.string().nullable().optional(),
});
export type UpdateApoliceSeguroInput = z.infer<typeof UpdateApoliceSeguroSchema>;
