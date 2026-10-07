import { z } from 'zod';
import { TipoManutencaoVeiculoSchema } from '../enums.js';

/** Limite de fotos anexadas a uma solicitação de manutenção (upload opcional). */
export const MANUTENCAO_FOTOS_MAX = 5;

/** Tamanho máximo de cada foto em base64 (~360 KB por imagem já reduzida no cliente). */
export const MANUTENCAO_FOTO_MAX_BYTES = 500_000;

const HoraSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (use HH:MM)');

const FotoSchema = z
  .string()
  .max(
    MANUTENCAO_FOTO_MAX_BYTES,
    `Foto acima de ${Math.round(MANUTENCAO_FOTO_MAX_BYTES / 1000)} KB`,
  );

/**
 * Manutenção de um veículo da frota (Módulo 4, critério "Gestão de Ativos"):
 * tipo, data, custo, km do veículo no momento do serviço e a previsão da
 * próxima manutenção (por data e/ou por quilometragem). A solicitação registra
 * também hora, o usuário que abriu (server-set) e fotos opcionais do veículo.
 */
export const ManutencaoVeiculoSchema = z.object({
  id: z.string().uuid(),
  veiculo_id: z.string().uuid(),
  tipo: TipoManutencaoVeiculoSchema,
  data_manutencao: z.string().date(),
  hora: HoraSchema.nullable().optional(),
  km_veiculo: z.number().nonnegative().nullable().optional(),
  custo: z.number().nonnegative(),
  descricao: z.string().nullable().optional(),
  proxima_manutencao_data: z.string().date().nullable().optional(),
  proxima_manutencao_km: z.number().nonnegative().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  solicitante_id: z.string().uuid().nullable().optional(),
  solicitante: z.string().nullable().optional(),
  fotos: z.array(FotoSchema).max(MANUTENCAO_FOTOS_MAX).nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type ManutencaoVeiculo = z.infer<typeof ManutencaoVeiculoSchema>;

export const CreateManutencaoVeiculoSchema = ManutencaoVeiculoSchema.extend({
  // Limites das colunas numeric do banco (custo: numeric(12,2); km: numeric(10,2)) — acima disso o Postgres responde 22003.
  km_veiculo: z.number().nonnegative().max(99_999_999.99).nullable().optional(),
  custo: z.number().nonnegative().max(9_999_999_999.99),
  proxima_manutencao_km: z.number().nonnegative().max(99_999_999.99).nullable().optional(),
}).omit({
  id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
  created_by: true,
  // Quem solicitou é definido pelo servidor a partir do token — nunca pelo cliente.
  solicitante_id: true,
  solicitante: true,
});
export type CreateManutencaoVeiculoInput = z.infer<typeof CreateManutencaoVeiculoSchema>;

export const UpdateManutencaoVeiculoSchema = CreateManutencaoVeiculoSchema.omit({
  veiculo_id: true,
}).partial();
export type UpdateManutencaoVeiculoInput = z.infer<typeof UpdateManutencaoVeiculoSchema>;
