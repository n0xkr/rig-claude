import { z } from 'zod';
import {
  IMPORT_TARGET_FIELDS,
  ImportTargetSchema,
  mapearPorNome,
  pontuarAlvo,
} from '@rigabras/shared';
import type { AnalisarPlanilhaInput, AnalisarPlanilhaResult, ImportTarget } from '@rigabras/shared';
import { completeJson } from '../groq/groq.client.js';
import { isGroqConfigured } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/** Fallback determinístico (sem IA): escolhe o alvo com melhor pontuação. */
export function analisarHeuristica(input: AnalisarPlanilhaInput): AnalisarPlanilhaResult {
  const alvos = ImportTargetSchema.options as ImportTarget[];
  const melhor = input.alvo
    ? { t: input.alvo }
    : alvos
        .map((t) => ({ t, score: pontuarAlvo(t, input.cabecalhos).pontos }))
        .sort((a, b) => b.score - a.score)[0]!;
  const mapeamento = mapearPorNome(melhor.t, input.cabecalhos);
  const mapeadas = Object.values(mapeamento).filter(Boolean).length;
  return {
    origem: 'HEURISTICA',
    target: melhor.t,
    confianca: Math.max(0.1, Math.min(0.75, mapeadas / Math.max(input.cabecalhos.length, 1))),
    mapeamento,
    valueMaps: {},
    observacoes: [
      'Mapeamento sugerido por nome de coluna (IA indisponível). Revise antes de importar.',
    ],
  };
}

const RespostaIaSchema = z.object({
  target: ImportTargetSchema,
  confianca: z.number().min(0).max(1).catch(0.5),
  mapeamento: z.record(z.string().nullable()),
  valueMaps: z.record(z.record(z.string())).optional().default({}),
  observacoes: z.array(z.string()).optional().default([]),
});

function descreverAlvos(): string {
  return (ImportTargetSchema.options as ImportTarget[])
    .map((t) => {
      const campos = IMPORT_TARGET_FIELDS[t]
        .map(
          (c) =>
            `    - ${c.key} (${c.label}; ${c.type}${c.required ? '; OBRIGATÓRIO' : ''}${
              c.options ? `; valores: ${c.options.join('|')}` : ''
            })`,
        )
        .join('\n');
      return `  * ${t}:\n${campos}`;
    })
    .join('\n');
}

const SYSTEM = `Você é o interpretador de planilhas do TMS da Rigabras Transportes (transporte rodoviário
de cargas e gestão de frota). Recebe os CABEÇALHOS e uma AMOSTRA de linhas de uma planilha e decide
para qual tabela do sistema ela deve ser importada e como cada coluna se mapeia.

ALVOS E CAMPOS DISPONÍVEIS:
${descreverAlvos()}

Responda ESTRITAMENTE em JSON, sem texto extra, no formato:
{
  "target": "veiculos" | "viagens" | "manutencoes_veiculo",
  "confianca": número entre 0 e 1,
  "mapeamento": { "<nome exato da coluna>": "<chave do campo>" | null },
  "valueMaps": { "<campo enum>": { "<valor original da planilha>": "<valor aceito pelo sistema>" } },
  "observacoes": [ "avisos curtos ao usuário em português" ]
}
Regras:
- Use SOMENTE chaves de campo listadas no alvo escolhido; colunas sem correspondência recebem null.
- Cada campo do sistema pode receber no máximo UMA coluna.
- Planilha de frota/acompanhamento de veículos (placa, modelo, status, km, combustível, manutenção) => "veiculos".
- Planilha de viagens/rotas (origem, destino, CRT, carga) => "viagens". Manutenções com custo/data => "manutencoes_veiculo".
- Em valueMaps, mapeie os valores DISTINTOS vistos na amostra para os valores aceitos (ex: "Em Trânsito" -> "EM_TRANSITO", "Cavalo Mecânico" -> "CAVALO"). Só inclua campos do tipo enum.
- NUNCA invente colunas que não existem nos cabeçalhos.
- "perfilColunas" descreve TODAS as linhas da aba (não só a amostra): use "valoresDistintos" para montar valueMaps completos e o tipo/preenchimento para escolher colunas melhores (prefira a coluna mais preenchida quando houver duas candidatas).
- Se "alvoDefinidoPeloUsuario" não for null, use exatamente esse alvo.
- "outrasAbas" mostra as demais abas do arquivo (nome, tipo, colunas). Se esta aba for cadastro auxiliar/lista/dicionário e não uma tabela de dados do alvo, use confiança baixa e explique em "observacoes".`;

/** Valida a resposta da IA contra o alvo real: descarta campos/valores inexistentes. */
function sanear(
  bruto: z.infer<typeof RespostaIaSchema>,
  input: AnalisarPlanilhaInput,
): AnalisarPlanilhaResult {
  const campos = IMPORT_TARGET_FIELDS[bruto.target];
  const chaves = new Set(campos.map((c) => c.key));
  const usados = new Set<string>();
  const mapeamento: Record<string, string | null> = {};
  for (const col of input.cabecalhos) {
    const alvo = bruto.mapeamento[col] ?? null;
    if (alvo && chaves.has(alvo) && !usados.has(alvo)) {
      usados.add(alvo);
      mapeamento[col] = alvo;
    } else {
      mapeamento[col] = null;
    }
  }
  const valueMaps: Record<string, Record<string, string>> = {};
  for (const [campo, mapa] of Object.entries(bruto.valueMaps)) {
    const spec = campos.find((c) => c.key === campo);
    if (!spec?.options) continue;
    const limpo: Record<string, string> = {};
    for (const [de, para] of Object.entries(mapa)) {
      if (spec.options.includes(para)) limpo[de] = para;
    }
    if (Object.keys(limpo).length > 0) valueMaps[campo] = limpo;
  }
  return {
    origem: 'IA',
    target: bruto.target,
    confianca: bruto.confianca,
    mapeamento,
    valueMaps,
    observacoes: bruto.observacoes.slice(0, 8),
  };
}

export async function analisarPlanilha(
  input: AnalisarPlanilhaInput,
): Promise<AnalisarPlanilhaResult> {
  if (!isGroqConfigured) return analisarHeuristica(input);
  try {
    const usuario = JSON.stringify(
      {
        nomeArquivo: input.nome ?? null,
        alvoDefinidoPeloUsuario: input.alvo ?? null,
        cabecalhos: input.cabecalhos,
        // Perfil calculado sobre TODAS as linhas da aba (tipo, preenchimento, valores distintos).
        perfilColunas: input.perfil,
        amostra: input.amostra,
        // Visão das demais abas do arquivo: ajuda a decidir se esta aba é dado principal ou cadastro auxiliar.
        outrasAbas: input.outrasAbas,
      },
      null,
    );
    const bruto = await completeJson(SYSTEM, usuario.slice(0, 30000), 1800);
    const parsed = RespostaIaSchema.safeParse(bruto);
    if (!parsed.success) throw new Error('Resposta da IA fora do formato esperado');
    // Destino escolhido pelo usuário prevalece; sanear() descarta campos que não existam nele.
    if (input.alvo) parsed.data.target = input.alvo;
    return sanear(parsed.data, input);
  } catch (err) {
    logger.warn({ err }, 'Análise de planilha por IA falhou; usando heurística');
    const fallback = analisarHeuristica(input);
    fallback.observacoes.unshift(
      'A IA não respondeu; usei um mapeamento automático por nome de coluna.',
    );
    return fallback;
  }
}
