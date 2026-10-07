import type {
  CampoPersonalizado,
  CampoPersonalizadoImportado,
  EntidadeCampoPersonalizado,
  TipoCampoPersonalizado,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../../config/supabase.js';
import { logger } from '../../../config/logger.js';
import { isSchemaAusente } from '../../../lib/permissoes.js';
import { chaveExtraDeVeiculo } from './consolidacao.js';
import type { AbaLida } from './interpretacao.js';

/**
 * Colunas novas das planilhas viram CAMPOS do sistema: cada coluna sem campo próprio é guardada
 * em `dados_extras` (valor tipado pela padronização: hora "14:30", data "2026-10-01", número,
 * sim/não) e registrada no catálogo `campos_personalizados` com nome e tipo — é o catálogo que
 * permite às telas mostrarem o valor formatado. Sem a migration 0015 os valores são gravados do
 * mesmo jeito; só o catálogo fica de fora (aviso na prévia).
 */

const ENTIDADE_DA_ABA: Partial<Record<string, EntidadeCampoPersonalizado>> = {
  viagens: 'viagens',
  veiculos: 'veiculos',
  motoristas: 'motoristas',
  clientes: 'clientes',
};

const TIPO_DA_COLUNA: Record<string, TipoCampoPersonalizado> = {
  hora: 'hora',
  data: 'data',
  datahora: 'datahora',
  numero: 'numero',
  booleano: 'booleano',
};

/** Colunas sem campo próprio das abas reconhecidas, sem repetição, com o tipo detectado. */
export function descobrirCamposNovos(abas: AbaLida[]): Array<CampoPersonalizado & { preenchidas: number }> {
  const out = new Map<string, CampoPersonalizado & { preenchidas: number }>();
  for (const a of abas) {
    const entidade = ENTIDADE_DA_ABA[a.tipo];
    if (!entidade) continue;
    for (const c of a.info.colunas) {
      if (c.origem !== 'extra' || !c.preenchidas) continue;
      const chave = entidade === 'veiculos' ? chaveExtraDeVeiculo(a.info.aba, c.coluna) : c.coluna.trim();
      if (!chave) continue;
      const k = `${entidade}|${chave}`;
      const atual = out.get(k);
      if (atual) {
        atual.preenchidas += c.preenchidas;
        continue;
      }
      out.set(k, {
        entidade,
        chave,
        rotulo: chave,
        tipo: TIPO_DA_COLUNA[c.tipo ?? ''] ?? 'texto',
        exemplo: c.exemplos?.[0] ?? null,
        preenchidas: c.preenchidas,
      });
    }
  }
  return [...out.values()];
}

/** Chaves (`entidade|chave`) já no catálogo; `null` = catálogo inexistente (migration 0015 pendente). */
export async function carregarCatalogo(): Promise<Set<string> | null> {
  const { data, error } = await supabaseAdmin.from('campos_personalizados').select('entidade, chave').limit(20000);
  if (error) {
    if (!isSchemaAusente(error)) logger.warn({ error }, 'Não foi possível ler o catálogo de campos personalizados');
    return null;
  }
  return new Set((data ?? []).map((r) => `${String(r.entidade)}|${String(r.chave)}`));
}

export function marcarNovos(
  campos: Array<CampoPersonalizado & { preenchidas: number }>,
  catalogo: Set<string> | null,
): CampoPersonalizadoImportado[] {
  return campos.map((c) => ({ ...c, novo: !catalogo?.has(`${c.entidade}|${c.chave}`) }));
}

/** Cria no catálogo os campos que ainda não existem. Devolve quantos foram criados. */
export async function registrarCampos(campos: CampoPersonalizadoImportado[], userId: string | null): Promise<number> {
  const novos = campos.filter((c) => c.novo);
  if (novos.length === 0) return 0;
  let criados = 0;
  for (let i = 0; i < novos.length; i += 100) {
    const lote = novos.slice(i, i + 100).map((c) => ({
      entidade: c.entidade,
      chave: c.chave.slice(0, 300),
      rotulo: c.rotulo.slice(0, 300),
      tipo: c.tipo,
      exemplo: c.exemplo ? String(c.exemplo).slice(0, 200) : null,
      origem: 'IMPORTACAO',
      criado_por: userId,
    }));
    const { error } = await supabaseAdmin.from('campos_personalizados').insert(lote);
    if (!error) {
      criados += lote.length;
      continue;
    }
    // Corrida com outra importação (unique violation): tenta um a um, ignorando os que já existem.
    for (const linha of lote) {
      const { error: e2 } = await supabaseAdmin.from('campos_personalizados').insert(linha);
      if (!e2) criados++;
      else if ((e2 as { code?: string }).code !== '23505') logger.warn({ e2 }, 'Falha ao registrar campo personalizado');
    }
  }
  return criados;
}
