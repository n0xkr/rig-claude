import { z } from 'zod';
import { ImportTargetSchema } from './importacao.js';
import { VeiculoSchema } from './veiculo.js';

/** Viagem em andamento associada a um veículo (visão de acompanhamento). */
export const ViagemAtivaResumoSchema = z.object({
  id: z.string().uuid(),
  origem: z.string(),
  destino: z.string(),
  status: z.string(),
});
export type ViagemAtivaResumo = z.infer<typeof ViagemAtivaResumoSchema>;

export const AcompanhamentoVeiculoSchema = VeiculoSchema.extend({
  viagem_ativa: ViagemAtivaResumoSchema.nullable().optional(),
});
export type AcompanhamentoVeiculo = z.infer<typeof AcompanhamentoVeiculoSchema>;

export interface ResumoAcompanhamento {
  total: number;
  por_status: Record<string, number>;
  combustivel_medio: number | null;
  combustivel_baixo: Array<{ placa: string; nivel: number }>;
  km_total: number;
  km_por_veiculo: Array<{ placa: string; km: number }>;
  manutencao_vencida: Array<{ placa: string; dias: number }>;
  manutencao_proxima: Array<{ placa: string; dias: number }>;
  sem_dados: number;
}

export const EscopoInsightSchema = z.enum([
  'geral',
  'status',
  'combustivel',
  'quilometragem',
  'manutencao',
]);
export type EscopoInsight = z.infer<typeof EscopoInsightSchema>;

export const InsightSchema = z.object({
  titulo: z.string(),
  detalhe: z.string(),
  severidade: z.enum(['info', 'atencao', 'critico']).default('info'),
  acao: z.string().optional(),
});
export type Insight = z.infer<typeof InsightSchema>;

export interface InsightsResult {
  escopo: EscopoInsight;
  origem: 'IA' | 'REGRAS';
  insights: Insight[];
  geradoEm: string;
}

/**
 * Entrada da análise de planilha por IA: cabeçalhos + amostra + o PERFIL calculado no cliente sobre
 * todas as linhas da aba + um resumo das demais abas (nunca a planilha inteira).
 */
export const AnalisarPlanilhaInputSchema = z.object({
  nome: z.string().max(200).optional(),
  /** Destino já escolhido pelo usuário: a IA só mapeia colunas para ele, sem reclassificar. */
  alvo: ImportTargetSchema.optional(),
  cabecalhos: z.array(z.string()).min(1).max(200),
  amostra: z.array(z.record(z.unknown())).min(1).max(30),
  perfil: z
    .array(
      z.object({
        nome: z.string().max(120),
        tipo: z.string().max(20),
        preenchimento: z.number().min(0).max(1),
        distintos: z.number().int().nonnegative(),
        exemplos: z.array(z.string().max(80)).max(4).optional(),
        valoresDistintos: z.array(z.string().max(80)).max(20).optional(),
      }),
    )
    .max(200)
    .optional(),
  outrasAbas: z
    .array(
      z.object({
        aba: z.string().max(80),
        tipo: z.string().max(20),
        linhas: z.number().int().nonnegative(),
        colunas: z.array(z.string().max(80)).max(30),
      }),
    )
    .max(60)
    .optional(),
});
export type AnalisarPlanilhaInput = z.infer<typeof AnalisarPlanilhaInputSchema>;

export interface AnalisarPlanilhaResult {
  origem: 'IA' | 'HEURISTICA';
  target: z.infer<typeof ImportTargetSchema>;
  confianca: number;
  /** coluna da planilha -> chave do campo do sistema (null = ignorar). */
  mapeamento: Record<string, string | null>;
  /** campo enum -> { valor original da planilha -> valor aceito pelo sistema }. */
  valueMaps: Record<string, Record<string, string>>;
  observacoes: string[];
}
