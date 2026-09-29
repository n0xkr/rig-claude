import type {
  CreateProdutoArmazenadoInput,
  ProdutoArmazenado,
  UpdateProdutoArmazenadoInput,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { mapPgError } from './pgErrors.js';

const TABLE = 'produtos_armazenados';

export interface ListProdutosFilter {
  depositanteId?: string;
  cursor?: string;
  limit: number;
}

/** CRUD do catálogo de produtos armazenados (SKU por depositante — Módulo 5). */
export class ProdutosRepository {
  async list(
    filter: ListProdutosFilter,
  ): Promise<{ data: ProdutoArmazenado[]; nextCursor: string | null }> {
    let query = supabaseAdmin
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .order('id', { ascending: false })
      .limit(filter.limit + 1);
    if (filter.depositanteId) query = query.eq('depositante_id', filter.depositanteId);
    if (filter.cursor) query = query.lt('id', filter.cursor);

    const { data, error } = await query;
    if (error) throw mapPgError(error);
    const rows = (data ?? []) as ProdutoArmazenado[];
    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    return { data: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  async findById(id: string): Promise<ProdutoArmazenado | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw mapPgError(error);
    return (data as ProdutoArmazenado | null) ?? null;
  }

  async create(
    input: CreateProdutoArmazenadoInput,
    createdBy: string | null,
  ): Promise<ProdutoArmazenado> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw mapPgError(error);
    return data as ProdutoArmazenado;
  }

  async update(id: string, input: UpdateProdutoArmazenadoInput): Promise<ProdutoArmazenado> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(input)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error) throw mapPgError(error);
    return data as ProdutoArmazenado;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw mapPgError(error);
  }
}
