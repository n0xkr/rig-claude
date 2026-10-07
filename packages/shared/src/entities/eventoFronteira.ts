import { z } from 'zod';
import { EtapaFronteiraSchema } from '../enums.js';

/**
 * Registro de uma etapa do fluxo de travessia de fronteira de uma viagem
 * (Módulo 2, critério #2): Agendamento -> Chegada -> Gate -> Fiscalização ->
 * Desembaraço -> Saída -> Liberação. Cada etapa é timestampada para permitir
 * o cálculo de KPIs (tempo parado, tempo de desembaraço, retenção, etc).
 */
export const EventoFronteiraSchema = z.object({
  id: z.string().uuid(),
  viagem_id: z.string().uuid(),
  etapa: EtapaFronteiraSchema,
  timestamp_etapa: z.string().datetime().optional(),
  tempo_parado_minutos: z.number().int().nonnegative().nullable().optional(),
  motivo_retencao: z.string().nullable().optional(),
  retrabalho_documental: z.boolean().default(false),
  custo_estimado_espera: z.number().nonnegative().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type EventoFronteira = z.infer<typeof EventoFronteiraSchema>;

export const CreateEventoFronteiraSchema = EventoFronteiraSchema.omit({
  id: true,
  created_at: true,
  deleted_at: true,
  created_by: true,
});
export type CreateEventoFronteiraInput = z.infer<typeof CreateEventoFronteiraSchema>;

/**
 * Payload de `POST /viagens/:viagemId/fronteira/eventos` — igual ao de
 * criação direta, mas sem `viagem_id` (vem da URL, injetado pelo
 * controller depois da validação — mesmo padrão de
 * `CreateFreteNestedSchema` no Módulo 3). Bug real corrigido nesta sessão:
 * o controller usava `CreateEventoFronteiraSchema` (que exige `viagem_id`
 * no corpo) para validar o body ANTES de mesclar o `viagem_id` da URL, então
 * toda chamada a essa rota falhava com 422 — nunca havia sido exercitada
 * ponta a ponta antes desta sessão de testes.
 */
export const CreateEventoFronteiraNestedSchema = CreateEventoFronteiraSchema.omit({
  viagem_id: true,
});
export type CreateEventoFronteiraNestedInput = z.infer<typeof CreateEventoFronteiraNestedSchema>;

/** KPIs de fronteira agregados por viagem (critério #2). */
export const FronteiraKpiViagemSchema = z.object({
  viagem_id: z.string().uuid(),
  numero_crt: z.string().nullable().optional(),
  placa_cavalo: z.string(),
  etapas_registradas: z.number().int().nonnegative(),
  tempo_parado_total_minutos: z.number().int().nonnegative(),
  tempo_desembaraco_minutos: z.number().int().nonnegative().nullable(),
  tempo_total_fronteira_minutos: z.number().int().nonnegative().nullable(),
  qtd_retencoes: z.number().int().nonnegative(),
  qtd_retrabalho_documental: z.number().int().nonnegative(),
  custo_estimado_espera_total: z.number().nonnegative(),
  motivos_retencao: z.array(z.string()),
});
export type FronteiraKpiViagem = z.infer<typeof FronteiraKpiViagemSchema>;

/** KPIs de fronteira agregados por rota (origem -> destino / país). */
export const FronteiraKpiRotaSchema = z.object({
  rota: z.string(),
  pais_destino: z.string().nullable(),
  qtd_viagens: z.number().int().nonnegative(),
  tempo_parado_medio_minutos: z.number().nonnegative(),
  tempo_desembaraco_medio_minutos: z.number().nonnegative(),
  custo_estimado_espera_total: z.number().nonnegative(),
});
export type FronteiraKpiRota = z.infer<typeof FronteiraKpiRotaSchema>;

export const FronteiraKpiResponseSchema = z.object({
  porViagem: z.array(FronteiraKpiViagemSchema),
  porRota: z.array(FronteiraKpiRotaSchema),
});
export type FronteiraKpiResponse = z.infer<typeof FronteiraKpiResponseSchema>;
