import type {
  CreateRedeInput,
  CreateRedeMovimentacaoInput,
  Rede,
  RedeMovimentacao,
  UpdateRedeInput,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { mapPgError } from './pgErrors.js';

const TABLE = 'redes';
const TABLE_MOV = 'rede_movimentacoes';

export interface ListRedesFilter {
  status?: string;
  condicao?: string;
  q?: string;
  cursor?: string;
  limit: number;
}

export interface ListRedesMovimentacoesFilter {
  redeId?: string;
  limit: number;
}

/** Cadastro e movimentação das redes de veículos (painel exclusivo do WMS). */
export class RedesRepository {
  async list(filter: ListRedesFilter): Promise<{ data: Rede[]; nextCursor: string | null }> {
    let query = supabaseAdmin
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .order('id', { ascending: false })
      .limit(filter.limit + 1);
    if (filter.status) query = query.eq('status', filter.status);
    if (filter.condicao) query = query.eq('condicao_uso', filter.condicao);
    if (filter.q) query = query.ilike('codigo', `%${filter.q}%`);
    if (filter.cursor) query = query.lt('id', filter.cursor);

    const { data, error } = await query;
    if (error) throw mapPgError(error);
    const rows = (data ?? []) as Rede[];
    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    return { data: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  async findById(id: string): Promise<Rede | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw mapPgError(error);
    return (data as Rede | null) ?? null;
  }

  /** Maior `codigo` já emitido (RED-######) — base da sequência da próxima rede. */
  async findMaxCodigo(): Promise<string | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('codigo')
      .like('codigo', 'RED-%')
      .order('codigo', { ascending: false })
      .limit(1);
    if (error) throw mapPgError(error);
    const rows = (data ?? []) as Array<{ codigo: string }>;
    return rows[0]?.codigo ?? null;
  }

  async create(
    input: CreateRedeInput & { codigo: string },
    createdBy: string | null,
  ): Promise<Rede> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw mapPgError(error);
    return data as Rede;
  }

  async update(id: string, patch: UpdateRedeInput | Partial<Rede>): Promise<Rede> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(patch)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error) throw mapPgError(error);
    return data as Rede;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw mapPgError(error);
  }

  async listMovimentacoes(
    filter: ListRedesMovimentacoesFilter,
  ): Promise<RedeMovimentacao[]> {
    let query = supabaseAdmin
      .from(TABLE_MOV)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(filter.limit);
    if (filter.redeId) query = query.eq('rede_id', filter.redeId);
    const { data, error } = await query;
    if (error) throw mapPgError(error);
    return (data ?? []) as RedeMovimentacao[];
  }

  async createMovimentacao(
    input: CreateRedeMovimentacaoInput,
    createdBy: string | null,
  ): Promise<RedeMovimentacao> {
    const { data, error } = await supabaseAdmin
      .from(TABLE_MOV)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw mapPgError(error);
    return data as RedeMovimentacao;
  }

  /** Contagens do painel (relatório em tempo real): total por status/condição e validades. */
  async listTodasParaKpis(): Promise<Rede[]> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .order('id', { ascending: true });
    if (error) throw mapPgError(error);
    return (data ?? []) as Rede[];
  }
}
