import type { CreateMotoristaInput, Motorista, UpdateMotoristaInput } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { fromPgError } from '../../lib/pgConstraintErrors.js';
import { isSchemaAusente } from '../../lib/permissoes.js';

const TABLE = 'motoristas';

/** Colunas criadas pela migration 0014 (dados da CNH lidos por OCR). */
const COLUNAS_0014 = ['rg', 'data_nascimento', 'nome_mae', 'nome_pai', 'cnh_primeira_habilitacao'] as const;
const ROTULO_0014: Record<(typeof COLUNAS_0014)[number], string> = {
  rg: 'RG',
  data_nascimento: 'Data de nascimento',
  nome_mae: 'Nome da mãe',
  nome_pai: 'Nome do pai',
  cnh_primeira_habilitacao: '1ª habilitação',
};

/**
 * Banco sem a migration 0014: as colunas novas ainda não existem. Em vez de
 * perder o dado, ele vai para `dados_extras` (coluna da 0012) até a migration
 * ser aplicada.
 */
function semColunas0014(
  input: Record<string, unknown>,
  extrasAtuais: Record<string, unknown> | null = null,
): Record<string, unknown> {
  const row: Record<string, unknown> = { ...input };
  const extras: Record<string, unknown> = { ...(extrasAtuais ?? {}), ...((input.dados_extras as Record<string, unknown>) ?? {}) };
  for (const c of COLUNAS_0014) {
    if (row[c] !== undefined && row[c] !== null) extras[ROTULO_0014[c]] = row[c];
    delete row[c];
  }
  if (Object.keys(extras).length > 0) row.dados_extras = extras;
  return row;
}

export class MotoristasRepository {
  async list(
    limit: number,
    cursor?: string,
  ): Promise<{ data: Motorista[]; nextCursor: string | null }> {
    let query = supabaseAdmin
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .order('id', { ascending: false })
      .limit(limit + 1);
    if (cursor) query = query.lt('id', cursor);
    const { data, error } = await query;
    if (error) throw fromPgError(error);
    const rows = (data ?? []) as Motorista[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { data: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  async findById(id: string): Promise<Motorista | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw fromPgError(error);
    return (data as Motorista | null) ?? null;
  }

  async findByCpf(cpf: string): Promise<Motorista | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('cpf', cpf)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw fromPgError(error);
    return (data as Motorista | null) ?? null;
  }

  async create(input: CreateMotoristaInput): Promise<Motorista> {
    let { data, error } = await supabaseAdmin.from(TABLE).insert(input).select('*').single();
    if (error && isSchemaAusente(error)) {
      ({ data, error } = await supabaseAdmin
        .from(TABLE)
        .insert(semColunas0014(input))
        .select('*')
        .single());
    }
    if (error) throw fromPgError(error);
    return data as Motorista;
  }

  async update(id: string, input: UpdateMotoristaInput): Promise<Motorista> {
    const executar = (row: Record<string, unknown>) =>
      supabaseAdmin.from(TABLE).update(row).eq('id', id).is('deleted_at', null).select('*').single();
    let { data, error } = await executar(input);
    if (error && isSchemaAusente(error)) {
      const atual = await this.findById(id);
      ({ data, error } = await executar(semColunas0014(input, atual?.dados_extras ?? null)));
    }
    if (error) throw fromPgError(error);
    return data as Motorista;
  }

  /** Viagens ainda em andamento (não ENCERRADA/CANCELADA) do motorista — o soft delete é um UPDATE, a FK RESTRICT do banco não protege. */
  async countViagensAtivas(id: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from('viagens')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .not('status', 'in', '(ENCERRADA,CANCELADA,ENTREGUE)')
      .eq('motorista_id', id);
    if (error) throw fromPgError(error);
    return count ?? 0;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw fromPgError(error);
  }
}
