import type { CreateDepositanteInput, Depositante, UpdateDepositanteInput } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { mapPgError } from './pgErrors.js';

const TABLE = 'depositantes';

export interface ListDepositantesFilter {
  ativo?: boolean;
  cursor?: string;
  limit: number;
}

/** CRUD de depositantes (Módulo 5 — clientes do serviço de Armazém Geral, ver nota de modelagem #1 na migration 0006). */
export class DepositantesRepository {
  async list(
    filter: ListDepositantesFilter,
  ): Promise<{ data: Depositante[]; nextCursor: string | null }> {
    let query = supabaseAdmin
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .order('id', { ascending: false })
      .limit(filter.limit + 1);
    if (filter.ativo !== undefined) query = query.eq('ativo', filter.ativo);
    if (filter.cursor) query = query.lt('id', filter.cursor);

    const { data, error } = await query;
    if (error) throw mapPgError(error);
    const rows = (data ?? []) as Depositante[];
    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    return { data: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  async findById(id: string): Promise<Depositante | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw mapPgError(error);
    return (data as Depositante | null) ?? null;
  }

  async create(input: CreateDepositanteInput, createdBy: string | null): Promise<Depositante> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw mapPgError(error);
    return data as Depositante;
  }

  async update(id: string, input: UpdateDepositanteInput): Promise<Depositante> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(input)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error) throw mapPgError(error);
    return data as Depositante;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw mapPgError(error);
  }
}
