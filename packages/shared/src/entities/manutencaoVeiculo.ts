import { z } from 'zod';
import { TipoManutencaoVeiculoSchema } from '../enums.js';

/**
 * Manutenção de um veículo da frota (Módulo 4, critério "Gestão de Ativos"):
 * tipo, data, custo, km do veículo no momento do serviço e a previsão da
 * próxima manutenção (por data e/ou por quilometragem).
 */
export const ManutencaoVeiculoSchema = z.object({
  id: z.string().uuid(),
  veiculo_id: z.string().uuid(),
  tipo: TipoManutencaoVeiculoSchema,
  data_manutencao: z.string().date(),
  km_veiculo: z.number().nonnegative().nullable().optional(),
  custo: z.number().nonnegative(),
  descricao: z.string().nullable().optional(),
  proxima_manutencao_data: z.string().date().nullable().optional(),
  proxima_manutencao_km: z.number().nonnegative().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type ManutencaoVeiculo = z.infer<typeof ManutencaoVeiculoSchema>;

export const CreateManutencaoVeiculoSchema = ManutencaoVeiculoSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
  created_by: true,
});
export type CreateManutencaoVeiculoInput = z.infer<typeof CreateManutencaoVeiculoSchema>;

export const UpdateManutencaoVeiculoSchema = CreateManutencaoVeiculoSchema.omit({
  veiculo_id: true,
}).partial();
export type UpdateManutencaoVeiculoInput = z.infer<typeof UpdateManutencaoVeiculoSchema>;
