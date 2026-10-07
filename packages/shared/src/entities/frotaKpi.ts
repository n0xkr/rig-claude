import { z } from 'zod';

/**
 * Payload de `PATCH /api/v1/frota/viagens/:viagemId/quilometragem` — registra
 * km rodado, km vazio e consumo de combustível de uma viagem já concluída
 * (colunas próprias do Módulo 4 em `viagens`, ver migration 0005). Não
 * substitui nenhum campo do Módulo 2.
 */
export const AtualizarQuilometragemViagemSchema = z
  .object({
    km_rodado: z.number().nonnegative().nullable().optional(),
    km_vazio: z.number().nonnegative().nullable().optional(),
    consumo_combustivel_litros: z.number().nonnegative().nullable().optional(),
  })
  .refine(
    (data) => data.km_rodado == null || data.km_vazio == null || data.km_vazio <= data.km_rodado,
    {
      message: 'km_vazio não pode ser maior que km_rodado',
      path: ['km_vazio'],
    },
  );
export type AtualizarQuilometragemViagemInput = z.infer<typeof AtualizarQuilometragemViagemSchema>;

/** KPIs de frota agregados por veículo, no período filtrado. */
export const FrotaKpiVeiculoSchema = z.object({
  veiculo_id: z.string().uuid(),
  placa: z.string(),
  tipo: z.string(),
  frota_propria: z.boolean(),
  ativo: z.boolean(),
  status: z.enum(['DISPONIVEL', 'EM_VIAGEM']),
  qtd_viagens: z.number().int().nonnegative(),
  km_rodado_total: z.number().nonnegative(),
  km_vazio_total: z.number().nonnegative(),
  consumo_combustivel_total_litros: z.number().nonnegative(),
  consumo_medio_km_litro: z.number().nonnegative().nullable(),
  custo_manutencao_total: z.number().nonnegative(),
  custo_km: z.number().nonnegative().nullable(),
  qtd_viagens_retorno_vazio: z.number().int().nonnegative(),
});
export type FrotaKpiVeiculo = z.infer<typeof FrotaKpiVeiculoSchema>;

/**
 * Resposta agregada dos indicadores de frota (Módulo 4, "Indicadores
 * Prioritários de Frota"): quilometragem (km rodado/vazio), custos e
 * eficiência (custo/km, consumo), utilização (ocupação, disponíveis x em
 * viagem) e o detalhamento por veículo. `percentual_viagens_retorno_vazio` é
 * calculado cruzando (via JOIN, nunca duplicando) `fretes.retorno_vazio`
 * (Módulo 3) — ver nota de modelagem na migration 0005.
 */
export const FrotaKpiResponseSchema = z.object({
  periodo: z.object({
    inicio: z.string().nullable(),
    fim: z.string().nullable(),
  }),
  frota_total: z.number().int().nonnegative(),
  veiculos_disponiveis: z.number().int().nonnegative(),
  veiculos_em_viagem: z.number().int().nonnegative(),
  percentual_ocupacao: z.number().nonnegative(),
  km_rodado_total: z.number().nonnegative(),
  km_vazio_total: z.number().nonnegative(),
  percentual_km_vazio: z.number().nonnegative(),
  percentual_viagens_retorno_vazio: z.number().nonnegative(),
  consumo_combustivel_total_litros: z.number().nonnegative(),
  consumo_medio_km_litro: z.number().nonnegative().nullable(),
  custo_manutencao_total: z.number().nonnegative(),
  custo_km_frota: z.number().nonnegative().nullable(),
  por_veiculo: z.array(FrotaKpiVeiculoSchema),
});
export type FrotaKpiResponse = z.infer<typeof FrotaKpiResponseSchema>;
