import type { Expedicao, ExpedicaoItem, StatusExpedicao } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';

const TABLE = 'expedicoes';
const ITENS_TABLE = 'expedicao_itens';

export interface ListExpedicoesFilter {
  depositanteId?: string;
  status?: StatusExpedicao;
  cursor?: string;
  limit: number;
}

/** Cabeçalho + itens de expedição (Módulo 5, critérios "Separação/Reembalagem/Etiquetagem" e "Cross-docking/Expedição"). */
export class ExpedicoesRepository {
  async list(
    filter: ListExpedicoesFilter,
  ): Promise<{ data: Expedicao[]; nextCursor: string | null }> {
    let query = supabaseAdmin
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .order('id', { ascending: false })
      .limit(filter.limit + 1);
    if (filter.depositanteId) query = query.eq('depositante_id', filter.depositanteId);
    if (filter.status) query = query.eq('status', filter.status);
    if (filter.cursor) query = query.lt('id', filter.cursor);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as Expedicao[];
    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    return { data: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  async findById(id: string): Promise<Expedicao | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as Expedicao | null) ?? null;
  }

  /** Módulo 6 (Integração TMS+WMS): expedição vinculada a uma viagem do TMS (a mais recente, caso haja mais de uma). */
  async findByViagemId(viagemId: string): Promise<Expedicao | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('viagem_id', viagemId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as Expedicao | null) ?? null;
  }

  async create(
    input: {
      depositante_id: string;
      viagem_id?: string | null;
      referencia_documento?: string | null;
      tipo?: string;
      observacoes?: string | null;
    },
    createdBy: string | null,
  ): Promise<Expedicao> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw error;
    return data as Expedicao;
  }

  async update(id: string, patch: Partial<Expedicao>): Promise<Expedicao> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as Expedicao;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  // ----------------------------------------------------------------------
  // expedicao_itens
  // ----------------------------------------------------------------------
  async createItens(
    expedicaoId: string,
    itens: Array<{ produto_id: string; quantidade_solicitada: number }>,
  ): Promise<ExpedicaoItem[]> {
    const { data, error } = await supabaseAdmin
      .from(ITENS_TABLE)
      .insert(itens.map((item) => ({ ...item, expedicao_id: expedicaoId })))
      .select('*');
    if (error) throw error;
    return (data ?? []) as ExpedicaoItem[];
  }

  async listItens(expedicaoId: string): Promise<ExpedicaoItem[]> {
    const { data, error } = await supabaseAdmin
      .from(ITENS_TABLE)
      .select('*')
      .eq('expedicao_id', expedicaoId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ExpedicaoItem[];
  }

  async findItemById(itemId: string): Promise<ExpedicaoItem | null> {
    const { data, error } = await supabaseAdmin
      .from(ITENS_TABLE)
      .select('*')
      .eq('id', itemId)
      .maybeSingle();
    if (error) throw error;
    return (data as ExpedicaoItem | null) ?? null;
  }

  async updateItem(itemId: string, patch: Partial<ExpedicaoItem>): Promise<ExpedicaoItem> {
    const { data, error } = await supabaseAdmin
      .from(ITENS_TABLE)
      .update(patch)
      .eq('id', itemId)
      .select('*')
      .single();
    if (error) throw error;
    return data as ExpedicaoItem;
  }
}
