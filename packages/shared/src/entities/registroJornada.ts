import { z } from 'zod';
import { SeveridadeAchadoValidacaoSchema, TipoEventoJornadaSchema } from '../enums.js';

/**
 * Um evento pontual e imutável do log contínuo de jornada de um motorista
 * (Módulo 4, critério "Controle de Jornada" — ADI 5322). Nunca é editado após
 * criado: uma correção é feita lançando um novo evento, preservando a
 * integridade probatória do histórico (ver migration 0005).
 */
export const RegistroJornadaSchema = z.object({
  id: z.string().uuid(),
  motorista_id: z.string().uuid(),
  viagem_id: z.string().uuid().nullable().optional(),
  tipo_evento: TipoEventoJornadaSchema,
  timestamp_evento: z.string().datetime().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type RegistroJornada = z.infer<typeof RegistroJornadaSchema>;

export const CreateRegistroJornadaSchema = z.object({
  motorista_id: z.string().uuid(),
  viagem_id: z.string().uuid().nullable().optional(),
  tipo_evento: TipoEventoJornadaSchema,
  timestamp_evento: z.string().datetime().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  observacoes: z.string().nullable().optional(),
});
export type CreateRegistroJornadaInput = z.infer<typeof CreateRegistroJornadaSchema>;

/**
 * Um achado (finding) de conformidade com a ADI 5322 — mesmo padrão
 * estrutural de `AchadoValidacao` (Módulo 2, validação pré-embarque):
 * campo/severidade/mensagem, nunca apenas um booleano de aprovado/reprovado.
 * Reaproveita a mesma escala de severidade (`INFO | AVISO | BLOQUEANTE`) para
 * manter um vocabulário único de "achado estruturado" em todo o sistema.
 */
export const AchadoConformidadeJornadaSchema = z.object({
  campo: z.string(),
  severidade: SeveridadeAchadoValidacaoSchema,
  mensagem: z.string(),
  valorEsperado: z.string().nullable().optional(),
  valorEncontrado: z.string().nullable().optional(),
});
export type AchadoConformidadeJornada = z.infer<typeof AchadoConformidadeJornadaSchema>;

/**
 * Uma sessão de jornada consolidada (INICIO_JORNADA -> FIM_JORNADA, ou ainda
 * aberta), com os tempos computados a partir dos eventos brutos. Tempo de
 * espera CONTA como jornada (STF ADI 5322) — por isso `tempo_jornada_minutos`
 * é sempre a diferença bruta entre início e fim, nunca um cálculo que
 * "desconta" a espera.
 */
export const SessaoJornadaSchema = z.object({
  motorista_id: z.string().uuid(),
  aberta: z.boolean(),
  inicio_jornada: z.string().datetime().nullable(),
  fim_jornada: z.string().datetime().nullable(),
  tempo_jornada_minutos: z.number().int().nonnegative().nullable(),
  tempo_direcao_minutos: z.number().int().nonnegative(),
  tempo_espera_minutos: z.number().int().nonnegative(),
  tempo_descanso_minutos: z.number().int().nonnegative(),
  maior_bloco_descanso_minutos: z.number().int().nonnegative(),
  descanso_seguinte_minutos: z.number().int().nonnegative().nullable(),
  achados: z.array(AchadoConformidadeJornadaSchema),
  eventos: z.array(RegistroJornadaSchema),
});
export type SessaoJornada = z.infer<typeof SessaoJornadaSchema>;

/** Histórico consolidado de jornada de um motorista — pronto para export (critério "histórico consolidado para reduzir a exposição trabalhista"). */
export const HistoricoJornadaMotoristaSchema = z.object({
  motorista_id: z.string().uuid(),
  motorista_nome: z.string(),
  periodo: z.object({ inicio: z.string().nullable(), fim: z.string().nullable() }),
  sessoes: z.array(SessaoJornadaSchema),
  gerado_em: z.string().datetime(),
});
export type HistoricoJornadaMotorista = z.infer<typeof HistoricoJornadaMotoristaSchema>;

/** Um motorista com achados de não conformidade no painel agregado de alertas. */
export const AlertaConformidadeMotoristaSchema = z.object({
  motorista_id: z.string().uuid(),
  motorista_nome: z.string(),
  sessao_aberta: z.boolean(),
  achados: z.array(AchadoConformidadeJornadaSchema),
});
export type AlertaConformidadeMotorista = z.infer<typeof AlertaConformidadeMotoristaSchema>;
