import { z } from 'zod';
import {
  FLUXO_STATUS_VIAGEM,
  STATUS_VIAGEM_LABEL,
  TipoAbaImportacaoSchema,
  type StatusViagem,
  type TipoAbaImportacao,
} from '@rigabras/shared';
import { completeJson } from '../../groq/groq.client.js';
import { isGroqConfigured } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import type { CampoImport } from './dicionario.js';

/**
 * A IA entra só onde o dicionário não resolve: aba com nome/colunas
 * desconhecidos, coluna fora do dicionário e texto de status que as regras
 * não reconhecem. Toda resposta é validada contra as opções reais — a IA
 * nunca inventa campo, tipo de aba ou status. Sem IA configurada (ou se ela
 * falhar), a importação continua só com o dicionário.
 */

export const iaDisponivel = () => isGroqConfigured;

async function perguntar(system: string, user: unknown, maxTokens: number): Promise<unknown> {
  if (!isGroqConfigured) return null;
  try {
    return await Promise.race([
      completeJson(system, JSON.stringify(user).slice(0, 24000), maxTokens),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout da IA')), 30000)),
    ]);
  } catch (err) {
    logger.warn({ err }, 'IA da importação inteligente não respondeu');
    return null;
  }
}

const SYS_ABA = `Você classifica abas de planilhas de uma transportadora rodoviária internacional
(Rigabras, Uruguaiana/RS). Diga o que a aba contém, ESTRITAMENTE em JSON: {"tipo": "<tipo>", "motivo": "<curto>"}.
Tipos: viagens (uma linha por viagem/embarque: placa, rota, cliente, CRT, status),
veiculos (cadastro de cavalos/carretas), motoristas (cadastro de motoristas), clientes,
cargas (lista de documentos CRT/DANFE/NF por viagem), checklists (checklist de rastreador por placa/viagem),
smp (solicitações de monitoramento por viagem), consultas (pesquisa/consulta GR/seguradora de motorista/veículo),
ignorada (instruções, painéis, listas auxiliares, parâmetros, ou qualquer coisa que não seja registro operacional).`;

export async function classificarAbaComIa(
  nome: string,
  cabecalhos: string[],
  amostra: Array<Record<string, unknown>>,
): Promise<TipoAbaImportacao | null> {
  const r = await perguntar(SYS_ABA, { aba: nome, cabecalhos: cabecalhos.slice(0, 60), amostra: amostra.slice(0, 3) }, 200);
  const parsed = z.object({ tipo: TipoAbaImportacaoSchema }).safeParse(r);
  return parsed.success ? parsed.data.tipo : null;
}

const SYS_COLUNAS = `Você mapeia colunas de planilha para campos de um TMS. Para cada coluna recebida,
escolha o campo do sistema que ela representa ou null se não corresponder a nenhum.
Responda ESTRITAMENTE em JSON: {"mapeamento": {"<coluna exata>": "<campo>" | null}}.
Use SOMENTE campos da lista. Na dúvida, null (a coluna será guardada como informação extra).`;

export async function mapearColunasComIa(
  aba: string,
  colunas: Array<{ coluna: string; exemplos: string[] }>,
  livres: CampoImport[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (colunas.length === 0 || livres.length === 0) return out;
  const r = await perguntar(
    SYS_COLUNAS,
    {
      aba,
      campos: livres.map((c) => ({ campo: c.campo, significado: c.rotulo, tipo: c.tipo })),
      colunas: colunas.slice(0, 60),
    },
    1200,
  );
  const parsed = z.object({ mapeamento: z.record(z.string().nullable()) }).safeParse(r);
  if (!parsed.success) return out;
  const validos = new Map(livres.map((c) => [c.campo, c]));
  const usados = new Set<string>();
  for (const { coluna } of colunas) {
    const campo = parsed.data.mapeamento[coluna];
    if (!campo || !validos.has(campo)) continue;
    if (usados.has(campo) && !validos.get(campo)!.multi) continue;
    usados.add(campo);
    out.set(coluna, campo);
  }
  return out;
}

const SYS_STATUS = `Você traduz textos livres de acompanhamento de viagens de caminhão (Brasil -> Argentina/
Chile/Paraguai/Uruguai via Uruguaiana/Paso de los Libres) para a etapa da viagem no sistema.
Multilog = aduana brasileira em Uruguaiana; Cotecar = aduana argentina em Paso de los Libres ("Libres").
Responda ESTRITAMENTE em JSON: {"status": {"<texto exato>": "<CODIGO>" | null}}. Use null se não der para saber.
Etapas (CODIGO: significado):
`;

export async function statusComIa(textos: string[]): Promise<Map<string, StatusViagem>> {
  const out = new Map<string, StatusViagem>();
  if (textos.length === 0) return out;
  const etapas = [...FLUXO_STATUS_VIAGEM, 'CANCELADA' as const]
    .map((s) => `${s}: ${STATUS_VIAGEM_LABEL[s]}`)
    .join('\n');
  const r = await perguntar(`${SYS_STATUS}${etapas}`, { textos: textos.slice(0, 80) }, 1500);
  const parsed = z.object({ status: z.record(z.string().nullable()) }).safeParse(r);
  if (!parsed.success) return out;
  const validos = new Set<string>([...FLUXO_STATUS_VIAGEM, 'CANCELADA']);
  for (const [t, s] of Object.entries(parsed.data.status))
    if (s && validos.has(s)) out.set(t, s as StatusViagem);
  return out;
}
