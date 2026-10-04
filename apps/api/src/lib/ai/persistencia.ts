import { supabaseAdmin } from '../../config/supabase.js';
import { logger } from '../../config/logger.js';
import { isSchemaAusente } from '../permissoes.js';
import type { AdaptadorCachePersistente } from './cache.js';
import type { MotivoFalhaIa } from './tipos.js';
import type { RegistroUsoIa } from './uso.js';

/**
 * Persistência OPCIONAL da camada de IA no Supabase. Nada aqui guarda prompt,
 * dados ou saída bruta: só metadados de uso e, no cache, o objeto já validado
 * de tarefas NÃO sensíveis (o serviço nunca usa o cache persistente para OCR).
 * Se as tabelas não existirem (migration não aplicada), cada adaptador avisa
 * uma vez e se desliga — sem quebrar a chamada.
 *
 * SQL sugerido (aplicação manual, como as demais migrations):
 *
 *   create table if not exists ia_uso (
 *     id uuid primary key default gen_random_uuid(),
 *     created_at timestamptz not null default now(),
 *     tarefa text not null,
 *     familia text not null,
 *     usuario_id uuid references profiles(id) on delete set null,
 *     modelo text,
 *     tokens_entrada integer not null default 0,
 *     tokens_saida integer not null default 0,
 *     latencia_ms integer not null default 0,
 *     custo_estimado_usd numeric(12, 6) not null default 0,
 *     cache text not null,
 *     resultado text not null,
 *     chamadas integer not null default 0
 *   );
 *   create index if not exists idx_ia_uso_created_at on ia_uso(created_at desc);
 *   alter table ia_uso enable row level security;
 *
 *   create table if not exists ia_cache (
 *     chave text primary key,
 *     tarefa text not null,
 *     valor jsonb not null,
 *     expira_em timestamptz not null,
 *     created_at timestamptz not null default now()
 *   );
 *   alter table ia_cache enable row level security;
 */

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOuNull = (v: string | null | undefined) => (v && RE_UUID.test(v) ? v : null);

/** `ia_uso`: uma linha por chamada lógica (sem conteúdo). */
export function criarPersistenciaUso(): (r: RegistroUsoIa) => Promise<void> {
  let desligada = false;
  return async (r) => {
    if (desligada) return;
    const { error } = await supabaseAdmin.from('ia_uso').insert({
      tarefa: r.tarefa,
      familia: r.familia,
      usuario_id: uuidOuNull(r.usuarioId),
      modelo: r.modelo,
      tokens_entrada: r.tokensEntrada,
      tokens_saida: r.tokensSaida,
      latencia_ms: Math.round(r.latenciaMs),
      custo_estimado_usd: Math.round(r.custoEstimadoUsd * 1e6) / 1e6,
      cache: r.cache,
      resultado: r.resultado,
      chamadas: r.chamadas,
    });
    if (error) {
      if (isSchemaAusente(error)) {
        desligada = true;
        logger.warn('Tabela ia_uso ausente: uso da IA fica só no log (ver SQL em lib/ai/persistencia.ts)');
        return;
      }
      logger.warn({ codigo: error.code }, 'Falha ao gravar ia_uso');
    }
  };
}

/** `ia_cache`: cache persistente com TTL (só tarefas não sensíveis). */
export function criarCachePersistente(): AdaptadorCachePersistente {
  let desligado = false;
  const desligar = (error: { code?: string }) => {
    if (!isSchemaAusente(error)) return false;
    if (!desligado) logger.warn('Tabela ia_cache ausente: cache da IA fica só em memória');
    desligado = true;
    return true;
  };
  return {
    async obter(chave) {
      if (desligado) return undefined;
      const { data, error } = await supabaseAdmin
        .from('ia_cache')
        .select('valor, expira_em')
        .eq('chave', chave)
        .maybeSingle();
      if (error) {
        desligar(error);
        return undefined;
      }
      const linha = data as { valor?: unknown; expira_em?: string } | null;
      if (!linha || !linha.expira_em || Date.parse(linha.expira_em) <= Date.now()) return undefined;
      return linha.valor;
    },
    async gravar(chave, valor, ttlMs, tarefa) {
      if (desligado) return;
      const { error } = await supabaseAdmin.from('ia_cache').upsert({
        chave,
        tarefa,
        valor,
        expira_em: new Date(Date.now() + ttlMs).toISOString(),
      });
      if (error) desligar(error);
    },
  };
}

export interface EntradaAuditoriaIa {
  tarefa: string;
  /** Tabela/entidade afetada (ex.: "motoristas", "motorista_documentos"). */
  entidade: string;
  entidadeId?: string | null;
  usuarioId: string | null;
  modelo: string | null;
  /** NOMES dos campos que a IA devolveu preenchidos — nunca os valores. */
  campos: string[];
  versaoPrompt?: string;
  resultado?: 'OK' | MotivoFalhaIa;
  ip?: string | null;
}

/**
 * Trilha de auditoria do uso de IA SEM valores (ação "IA_USO" em audit_logs):
 * quem usou, em qual entidade, com qual modelo e quais campos vieram.
 * Falhas só viram aviso — auditoria nunca derruba a operação.
 */
export async function registrarAuditoriaIa(e: EntradaAuditoriaIa): Promise<void> {
  const { error } = await supabaseAdmin.from('audit_logs').insert({
    user_id: uuidOuNull(e.usuarioId),
    action: 'IA_USO',
    entity: e.entidade.slice(0, 80),
    entity_id: uuidOuNull(e.entidadeId),
    changes_json: {
      tarefa: e.tarefa,
      modelo: e.modelo,
      versao_prompt: e.versaoPrompt ?? null,
      resultado: e.resultado ?? 'OK',
      campos_retornados: e.campos.slice(0, 60).map((c) => c.slice(0, 60)),
    },
    ip: e.ip ?? null,
  });
  if (error) logger.warn({ codigo: error.code, tarefa: e.tarefa }, 'Falha ao gravar auditoria de uso da IA');
}
