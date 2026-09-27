import type { Inventario, InventarioItem } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';

const TABLE = 'inventarios';
const ITENS_TABLE = 'inventario_itens';

export interface ListInventariosFilter {
  armazemId?: string;
  cursor?: string;
  limit: number;
}

/** Inventário/contagem física (Módulo 5, critério #5): abertura, contagem e reconciliação contra o saldo do ledger. */
export class InventariosRepository {
  async list(
    filter: ListInventariosFilter,
  ): Promise<{ data: Inventario[]; nextCursor: string | null }> {
    let query = supabaseAdmin
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .order('id', { ascending: false })
      .limit(filter.limit + 1);
    if (filter.armazemId) query = query.eq('armazem_id', filter.armazemId);
    if (filter.cursor) query = query.lt('id', filter.cursor);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as Inventario[];
    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    return { data: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  async findById(id: string): Promise<Inventario | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as Inventario | null) ?? null;
  }

  async create(
    input: { armazem_id: string; observacoes?: string | null },
    createdBy: string | null,
  ): Promise<Inventario> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw error;
    return data as Inventario;
  }

  async update(id: string, patch: Partial<Inventario>): Promise<Inventario> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as Inventario;
  }

  // ----------------------------------------------------------------------
  // inventario_itens
  // ----------------------------------------------------------------------
  async createItens(
    inventarioId: string,
    itens: Array<{ produto_id: string; endereco_id: string; quantidade_sistema: number }>,
  ): Promise<InventarioItem[]> {
    if (itens.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from(ITENS_TABLE)
      .insert(itens.map((item) => ({ ...item, inventario_id: inventarioId })))
      .select('*');
    if (error) throw error;
    return (data ?? []) as InventarioItem[];
  }

  async listItens(inventarioId: string): Promise<InventarioItem[]> {
    const { data, error } = await supabaseAdmin
      .from(ITENS_TABLE)
      .select('*')
      .eq('inventario_id', inventarioId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as InventarioItem[];
  }

  async updateItem(itemId: string, patch: Partial<InventarioItem>): Promise<InventarioItem> {
    const { data, error } = await supabaseAdmin
      .from(ITENS_TABLE)
      .update(patch)
      .eq('id', itemId)
      .select('*')
      .single();
    if (error) throw error;
    return data as InventarioItem;
  }
}
