import type { Avaria } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';

const TABLE = 'avarias';

export interface ListAvariasFilter {
  produtoId?: string;
  severidade?: string;
  cursor?: string;
  limit: number;
}

/** Controle de avarias (Módulo 5, critério #5). */
export class AvariasRepository {
  async list(filter: ListAvariasFilter): Promise<{ data: Avaria[]; nextCursor: string | null }> {
    let query = supabaseAdmin
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .order('id', { ascending: false })
      .limit(filter.limit + 1);
    if (filter.produtoId) query = query.eq('produto_id', filter.produtoId);
    if (filter.severidade) query = query.eq('severidade', filter.severidade);
    if (filter.cursor) query = query.lt('id', filter.cursor);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as Avaria[];
    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    return { data: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  async findById(id: string): Promise<Avaria | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as Avaria | null) ?? null;
  }

  async create(input: Record<string, unknown>, createdBy: string | null): Promise<Avaria> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw error;
    return data as Avaria;
  }

  async update(id: string, patch: Partial<Avaria>): Promise<Avaria> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as Avaria;
  }

  async countBySeveridade(periodStart?: string, periodEnd?: string): Promise<Avaria[]> {
    let query = supabaseAdmin.from(TABLE).select('severidade').is('deleted_at', null);
    if (periodStart) query = query.gte('created_at', periodStart);
    if (periodEnd) query = query.lte('created_at', periodEnd);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Avaria[];
  }
}
