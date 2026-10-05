import type { Recebimento, RecebimentoItem, StatusRecebimento } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { mapPgError } from './pgErrors.js';

const TABLE = 'recebimentos';
const ITENS_TABLE = 'recebimento_itens';

export interface ListRecebimentosFilter {
  depositanteId?: string;
  status?: StatusRecebimento;
  cursor?: string;
  limit: number;
}

/** Cabeçalho + itens de recebimento (Módulo 5, critério "Recebimento e Conferência"). */
export class RecebimentosRepository {
  async list(
    filter: ListRecebimentosFilter,
  ): Promise<{ data: Recebimento[]; nextCursor: string | null }> {
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
    if (error) throw mapPgError(error);
    const rows = (data ?? []) as Recebimento[];
    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    return { data: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  async findById(id: string): Promise<Recebimento | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw mapPgError(error);
    return (data as Recebimento | null) ?? null;
  }

  /** Módulo 6 (Integração TMS+WMS): recebimento vinculado a uma viagem do TMS (o mais recente, caso haja mais de um). */
  async findByViagemId(viagemId: string): Promise<Recebimento | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('viagem_id', viagemId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw mapPgError(error);
    return (data as Recebimento | null) ?? null;
  }

  async create(
    input: {
      depositante_id: string;
      viagem_id?: string | null;
      referencia_documento?: string | null;
      data_prevista?: string | null;
      observacoes?: string | null;
    },
    createdBy: string | null,
  ): Promise<Recebimento> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw mapPgError(error);
    return data as Recebimento;
  }

  async update(id: string, patch: Partial<Recebimento>): Promise<Recebimento> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw mapPgError(error);
    return data as Recebimento;
  }

  /**
   * Claim atômico: atualiza somente se o status ainda for o esperado
   * (UPDATE condicional). Devolve null quando outra requisição venceu a
   * corrida — o service então responde 409 em vez de sobrescrever o estado.
   */
  async updateIfStatus(
    id: string,
    statusEsperado: Recebimento['status'],
    patch: Partial<Recebimento>,
  ): Promise<Recebimento | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(patch)
      .eq('id', id)
      .eq('status', statusEsperado)
      .select('*')
      .maybeSingle();
    if (error) throw mapPgError(error);
    return (data as Recebimento | null) ?? null;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw mapPgError(error);
  }

  // ----------------------------------------------------------------------
  // recebimento_itens
  // ----------------------------------------------------------------------
  async createItens(
    recebimentoId: string,
    itens: Array<{ produto_id: string; quantidade_esperada: number }>,
  ): Promise<RecebimentoItem[]> {
    const { data, error } = await supabaseAdmin
      .from(ITENS_TABLE)
      .insert(itens.map((item) => ({ ...item, recebimento_id: recebimentoId })))
      .select('*');
    if (error) throw mapPgError(error);
    return (data ?? []) as RecebimentoItem[];
  }

  async listItens(recebimentoId: string): Promise<RecebimentoItem[]> {
    const { data, error } = await supabaseAdmin
      .from(ITENS_TABLE)
      .select('*')
      .eq('recebimento_id', recebimentoId)
      .order('created_at', { ascending: true });
    if (error) throw mapPgError(error);
    return (data ?? []) as RecebimentoItem[];
  }

  async findItemById(itemId: string): Promise<RecebimentoItem | null> {
    const { data, error } = await supabaseAdmin
      .from(ITENS_TABLE)
      .select('*')
      .eq('id', itemId)
      .maybeSingle();
    if (error) throw mapPgError(error);
    return (data as RecebimentoItem | null) ?? null;
  }

  async updateItem(itemId: string, patch: Partial<RecebimentoItem>): Promise<RecebimentoItem> {
    const { data, error } = await supabaseAdmin
      .from(ITENS_TABLE)
      .update(patch)
      .eq('id', itemId)
      .select('*')
      .single();
    if (error) throw mapPgError(error);
    return data as RecebimentoItem;
  }
}
