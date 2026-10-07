import { z } from 'zod';
import type { EntidadeCadastro, SugestaoIa } from '@rigabras/shared';
import { RESPOSTA_EXTRA, RESPOSTA_IGNORAR } from '@rigabras/shared';
import { completeJson } from '../groq/groq.client.js';
import { isGroqConfigured } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ENTIDADES, type EntidadeDef } from './entidades.js';
import { normTexto } from './leitura.js';

/**
 * A IA (Groq) só SUGERE. Nenhuma sugestão é aplicada sozinha: ela aparece como
 * um selo "Sugestão da IA" na pergunta e quem decide é o administrador. Se a IA
 * estiver indisponível ou responder fora do formato, a pergunta é feita sem
 * sugestão — nunca se inventa uma resposta.
 */

const RespostaColunasSchema = z.object({
  sugestoes: z.record(
    z.object({
      destino: z.string(),
      confianca: z.number().min(0).max(1).catch(0.5),
      motivo: z.string().optional().default(''),
    }),
  ),
});

export interface ColunaDesconhecida {
  coluna: string;
  amostras: string[];
}

export async function sugerirDestinosDeColunas(
  aba: string,
  def: EntidadeDef,
  colunas: ColunaDesconhecida[],
  camposLivres: string[],
): Promise<Map<string, SugestaoIa>> {
  const resultado = new Map<string, SugestaoIa>();
  if (!isGroqConfigured || colunas.length === 0) return resultado;
  try {
    const campos = camposLivres
      .filter((k) => def.campos[k] && !def.campos[k]!.aux)
      .map((k) => `- ${k}: ${def.campos[k]!.label} (${def.campos[k]!.tipo})`)
      .join('\n');
    const system = `Você ajuda a cadastrar planilhas de uma transportadora rodoviária internacional (Rigabras).
Para cada COLUNA desconhecida da aba "${aba}" (entidade: ${def.rotulo}), sugira para qual campo do sistema ela deve ir.
Sua sugestão será apenas uma DICA mostrada ao administrador; ele decide. NUNCA invente: se não tiver certeza, use "${RESPOSTA_EXTRA}" com confiança baixa.
CAMPOS DISPONÍVEIS:
${campos || '(nenhum livre)'}
Destinos especiais: "${RESPOSTA_EXTRA}" (guardar como informação extra) e "${RESPOSTA_IGNORAR}" (ignorar a coluna).
Responda ESTRITAMENTE em JSON: {"sugestoes": {"<nome exato da coluna>": {"destino": "<campo|${RESPOSTA_EXTRA}|${RESPOSTA_IGNORAR}>", "confianca": 0..1, "motivo": "curto, em português"}}}`;
    const user = JSON.stringify(colunas.slice(0, 25), null, 1).slice(0, 12000);
    const bruto = await completeJson(system, user, 1200);
    const parsed = RespostaColunasSchema.safeParse(bruto);
    if (!parsed.success) return resultado;
    const validos = new Set([...camposLivres, RESPOSTA_EXTRA, RESPOSTA_IGNORAR]);
    for (const c of colunas) {
      const s = parsed.data.sugestoes[c.coluna];
      if (s && validos.has(s.destino)) {
        resultado.set(c.coluna, {
          valor: s.destino,
          confianca: s.confianca,
          ...(s.motivo ? { motivo: s.motivo } : {}),
        });
      }
    }
  } catch (err) {
    logger.warn({ err }, 'IA indisponível para sugerir colunas; perguntando sem sugestão');
  }
  return resultado;
}

const RespostaAbaSchema = z.object({
  entidade: z.string(),
  confianca: z.number().min(0).max(1).catch(0.5),
  motivo: z.string().optional().default(''),
});

/** Sugestão de qual entidade uma aba de nome desconhecido representa: primeiro por cobertura de cabeçalhos (determinística), depois pela IA. */
export async function sugerirEntidadeDeAba(
  aba: string,
  cabecalhos: string[],
  amostra: Array<Record<string, unknown>>,
): Promise<SugestaoIa | null> {
  const norm = new Set(cabecalhos.map(normTexto).filter(Boolean));
  let melhor: { e: EntidadeCadastro; acertos: number; cobertura: number } | null = null;
  for (const def of Object.values(ENTIDADES)) {
    const conhecidas = new Set(
      Object.keys(def.colunas).filter((k) => !('ignorar' in def.colunas[k]!)),
    );
    const acertos = [...norm].filter((k) => conhecidas.has(k)).length;
    // Fração dos cabeçalhos DA ABA que esta entidade explica.
    const cobertura = acertos / Math.max(norm.size, 1);
    if (
      !melhor ||
      acertos > melhor.acertos ||
      (acertos === melhor.acertos && cobertura > melhor.cobertura)
    ) {
      melhor = { e: def.entidade, acertos, cobertura };
    }
  }
  if (melhor && melhor.acertos >= 2 && melhor.cobertura >= 0.6) {
    return {
      valor: melhor.e,
      confianca: Math.min(0.95, melhor.cobertura * 0.9),
      motivo: `${melhor.acertos} de ${norm.size} cabeçalhos coincidem com o cadastro de ${ENTIDADES[melhor.e].rotulo}`,
    };
  }
  if (!isGroqConfigured) return null;
  try {
    const system = `Você classifica abas de planilhas de uma transportadora. Entidades possíveis: ${Object.values(
      ENTIDADES,
    )
      .map((d) => `${d.entidade} (${d.rotulo})`)
      .join(', ')}, ou "${RESPOSTA_IGNORAR}" se não corresponder a nenhuma.
Sua resposta é só uma DICA ao administrador. Se não tiver certeza, responda "${RESPOSTA_IGNORAR}" com confiança baixa.
Responda ESTRITAMENTE em JSON: {"entidade": "...", "confianca": 0..1, "motivo": "curto, em português"}`;
    const user = JSON.stringify({
      aba,
      cabecalhos: cabecalhos.slice(0, 60),
      amostra: amostra.slice(0, 3),
    }).slice(0, 8000);
    const parsed = RespostaAbaSchema.safeParse(await completeJson(system, user, 400));
    if (!parsed.success) return null;
    const validos = new Set<string>([...Object.keys(ENTIDADES), RESPOSTA_IGNORAR]);
    if (!validos.has(parsed.data.entidade)) return null;
    return {
      valor: parsed.data.entidade,
      confianca: parsed.data.confianca,
      ...(parsed.data.motivo ? { motivo: parsed.data.motivo } : {}),
    };
  } catch (err) {
    logger.warn({ err }, 'IA indisponível para classificar a aba; perguntando sem sugestão');
    return null;
  }
}
