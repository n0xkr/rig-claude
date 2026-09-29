import { z } from 'zod';
import { InsightSchema } from '@rigabras/shared';
import type {
  AcompanhamentoVeiculo,
  EscopoInsight,
  Insight,
  InsightsResult,
  ResumoAcompanhamento,
} from '@rigabras/shared';
import { AcompanhamentoRepository } from './acompanhamento.repository.js';
import { completeJson } from '../groq/groq.client.js';
import { isGroqConfigured } from '../../config/env.js';
import { logger } from '../../config/logger.js';

const DIA_MS = 86_400_000;
const LIMITE_COMBUSTIVEL_BAIXO = 25;
const JANELA_MANUTENCAO_DIAS = 30;

/** Dias inteiros entre hoje (UTC, sem hora) e uma data `YYYY-MM-DD`; negativo = já passou. */
function diasAte(data: string | null | undefined, hoje: Date): number | null {
  if (!data) return null;
  const alvo = Date.parse(`${data.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(alvo)) return null;
  const base = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.round((alvo - base) / DIA_MS);
}

export function calcularResumo(veiculos: AcompanhamentoVeiculo[], hoje = new Date()): ResumoAcompanhamento {
  const por_status: Record<string, number> = { DISPONIVEL: 0, EM_TRANSITO: 0, MANUTENCAO: 0, GARAGEM: 0 };
  const niveis: number[] = [];
  const combustivel_baixo: ResumoAcompanhamento['combustivel_baixo'] = [];
  const km_por_veiculo: ResumoAcompanhamento['km_por_veiculo'] = [];
  const manutencao_vencida: ResumoAcompanhamento['manutencao_vencida'] = [];
  const manutencao_proxima: ResumoAcompanhamento['manutencao_proxima'] = [];
  let km_total = 0;
  let sem_dados = 0;

  for (const v of veiculos) {
    por_status[v.status_operacional] = (por_status[v.status_operacional] ?? 0) + 1;
    if (v.km_atual == null && v.nivel_combustivel == null && !v.proxima_manutencao_data) sem_dados++;
    if (v.nivel_combustivel != null) {
      niveis.push(v.nivel_combustivel);
      if (v.nivel_combustivel <= LIMITE_COMBUSTIVEL_BAIXO) {
        combustivel_baixo.push({ placa: v.placa, nivel: v.nivel_combustivel });
      }
    }
    if (v.km_atual != null) {
      km_total += Number(v.km_atual);
      km_por_veiculo.push({ placa: v.placa, km: Number(v.km_atual) });
    }
    const dias = diasAte(v.proxima_manutencao_data, hoje);
    if (dias !== null) {
      if (dias < 0) manutencao_vencida.push({ placa: v.placa, dias });
      else if (dias <= JANELA_MANUTENCAO_DIAS) manutencao_proxima.push({ placa: v.placa, dias });
    }
  }

  km_por_veiculo.sort((a, b) => b.km - a.km);
  manutencao_vencida.sort((a, b) => a.dias - b.dias);
  manutencao_proxima.sort((a, b) => a.dias - b.dias);
  combustivel_baixo.sort((a, b) => a.nivel - b.nivel);

  return {
    total: veiculos.length,
    por_status,
    combustivel_medio: niveis.length ? Math.round(niveis.reduce((a, b) => a + b, 0) / niveis.length) : null,
    combustivel_baixo,
    km_total: Math.round(km_total),
    km_por_veiculo: km_por_veiculo.slice(0, 15),
    manutencao_vencida,
    manutencao_proxima,
    sem_dados,
  };
}

/** Insights determinísticos: base sempre disponível e rede de segurança se a IA falhar. */
export function insightsPorRegras(resumo: ResumoAcompanhamento, escopo: EscopoInsight): Insight[] {
  const out: Insight[] = [];
  const quer = (e: EscopoInsight) => escopo === 'geral' || escopo === e;

  if (resumo.total === 0) {
    return [
      {
        titulo: 'Nenhum veículo cadastrado',
        detalhe: 'Importe a planilha da frota para começar o acompanhamento.',
        severidade: 'info',
        acao: 'Use o botão "Importar planilha (IA)".',
      },
    ];
  }
  if (quer('manutencao') && resumo.manutencao_vencida.length > 0) {
    const lista = resumo.manutencao_vencida.slice(0, 5).map((m) => `${m.placa} (${-m.dias}d)`).join(', ');
    out.push({
      titulo: `${resumo.manutencao_vencida.length} veículo(s) com manutenção vencida`,
      detalhe: `Vencidas: ${lista}.`,
      severidade: 'critico',
      acao: 'Agendar manutenção imediatamente ou retirar de operação.',
    });
  }
  if (quer('manutencao') && resumo.manutencao_proxima.length > 0) {
    const lista = resumo.manutencao_proxima.slice(0, 5).map((m) => `${m.placa} (em ${m.dias}d)`).join(', ');
    out.push({
      titulo: `${resumo.manutencao_proxima.length} manutenção(ões) nos próximos ${JANELA_MANUTENCAO_DIAS} dias`,
      detalhe: lista,
      severidade: 'atencao',
      acao: 'Planejar a janela de oficina para não parar veículos em viagem.',
    });
  }
  if (quer('combustivel') && resumo.combustivel_baixo.length > 0) {
    const lista = resumo.combustivel_baixo.slice(0, 5).map((c) => `${c.placa} (${c.nivel}%)`).join(', ');
    out.push({
      titulo: `${resumo.combustivel_baixo.length} veículo(s) com combustível baixo (≤${LIMITE_COMBUSTIVEL_BAIXO}%)`,
      detalhe: lista,
      severidade: 'atencao',
      acao: 'Programar abastecimento antes da próxima viagem.',
    });
  }
  if (quer('status')) {
    const emOperacao = resumo.por_status.EM_TRANSITO ?? 0;
    const parados = (resumo.por_status.MANUTENCAO ?? 0) + (resumo.por_status.GARAGEM ?? 0);
    out.push({
      titulo: `${emOperacao} em trânsito, ${resumo.por_status.DISPONIVEL ?? 0} disponíveis, ${parados} parados`,
      detalhe: `Da frota de ${resumo.total}, ${Math.round((parados / resumo.total) * 100)}% está em manutenção/garagem.`,
      severidade: parados / resumo.total > 0.3 ? 'atencao' : 'info',
    });
  }
  if (quer('quilometragem') && resumo.km_por_veiculo.length > 0) {
    const top = resumo.km_por_veiculo[0]!;
    out.push({
      titulo: `Maior quilometragem: ${top.placa}`,
      detalhe: `${top.km.toLocaleString('pt-BR')} km; total da frota ${resumo.km_total.toLocaleString('pt-BR')} km.`,
      severidade: 'info',
      acao: 'Priorize revisões nos veículos de maior quilometragem.',
    });
  }
  if (resumo.sem_dados > 0 && escopo === 'geral') {
    out.push({
      titulo: `${resumo.sem_dados} veículo(s) sem dados de acompanhamento`,
      detalhe: 'Sem km, combustível ou data de manutenção — os indicadores ficam incompletos.',
      severidade: 'info',
      acao: 'Atualize pela planilha ou pelo botão de edição.',
    });
  }
  if (out.length === 0) {
    out.push({ titulo: 'Sem alertas para este indicador', detalhe: 'Nenhuma anomalia detectada nos dados atuais.', severidade: 'info' });
  }
  return out;
}

const RespostaInsightsSchema = z.object({ insights: z.array(InsightSchema).min(1).max(6) });

const SYSTEM_INSIGHTS = `Você é o analista de frota do TMS da Rigabras Transportes. Recebe um RESUMO agregado e uma
lista compacta de veículos e devolve insights operacionais para o gestor.
REGRAS: use SOMENTE os números fornecidos; nunca invente placas, valores ou causas (se for hipótese, diga
"possível causa a investigar"); cite placas e números concretos; seja objetivo, em português do Brasil
(use "quilometragem", nunca palavras em espanhol ou inglês).
Responda ESTRITAMENTE em JSON: {"insights":[{"titulo":string,"detalhe":string,"severidade":"info"|"atencao"|"critico","acao":string}]}
com 3 a 5 itens, do mais crítico ao menos crítico, focados no ESCOPO pedido.`;

export class AcompanhamentoService {
  constructor(private readonly repo: AcompanhamentoRepository = new AcompanhamentoRepository()) {}

  listar(): Promise<AcompanhamentoVeiculo[]> {
    return this.repo.listComViagemAtiva();
  }

  async resumo(): Promise<ResumoAcompanhamento> {
    return calcularResumo(await this.repo.listComViagemAtiva());
  }

  async insights(escopo: EscopoInsight): Promise<InsightsResult> {
    const veiculos = await this.repo.listComViagemAtiva();
    const resumo = calcularResumo(veiculos);
    const geradoEm = new Date().toISOString();
    const regras = insightsPorRegras(resumo, escopo);

    if (!isGroqConfigured || resumo.total === 0) {
      return { escopo, origem: 'REGRAS', insights: regras, geradoEm };
    }
    try {
      const compacta = veiculos.slice(0, 80).map((v) => ({
        placa: v.placa,
        status: v.status_operacional,
        motorista: v.motorista_atual ?? null,
        km: v.km_atual ?? null,
        combustivel_pct: v.nivel_combustivel ?? null,
        proxima_manutencao: v.proxima_manutencao_data ?? null,
        local: v.localizacao_atual ?? null,
        viagem: v.viagem_ativa ? `${v.viagem_ativa.origem} -> ${v.viagem_ativa.destino}` : null,
      }));
      const bruto = await completeJson(
        SYSTEM_INSIGHTS,
        JSON.stringify({ escopo, hoje: geradoEm.slice(0, 10), resumo, veiculos: compacta }),
        1200,
      );
      const parsed = RespostaInsightsSchema.safeParse(bruto);
      if (!parsed.success) throw new Error('Insights fora do formato esperado');
      return { escopo, origem: 'IA', insights: parsed.data.insights, geradoEm };
    } catch (err) {
      logger.warn({ err }, 'Insights por IA falharam; usando regras');
      return { escopo, origem: 'REGRAS', insights: regras, geradoEm };
    }
  }
}
