import type {
  CreateEnderecoArmazemInput,
  EnderecoArmazem,
  UpdateEnderecoArmazemInput,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { mapPgError } from './pgErrors.js';

const TABLE = 'enderecos_armazem';
const ARMAZENS_TABLE = 'armazens';

export interface ListEnderecosFilter {
  armazemId?: string;
  status?: string;
  cursor?: string;
  limit: number;
}

export interface ArmazemRow {
  id: string;
  nome: string;
  area_m2: number | null;
}

/** CRUD de endereços (bins) do armazém — mapa área/rua/prateleira/posição (Módulo 5). */
export class EnderecosRepository {
  async list(
    filter: ListEnderecosFilter,
  ): Promise<{ data: EnderecoArmazem[]; nextCursor: string | null }> {
    let query = supabaseAdmin
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .order('id', { ascending: false })
      .limit(filter.limit + 1);
    if (filter.armazemId) query = query.eq('armazem_id', filter.armazemId);
    if (filter.status) query = query.eq('status', filter.status);
    if (filter.cursor) query = query.lt('id', filter.cursor);

    const { data, error } = await query;
    if (error) throw mapPgError(error);
    const rows = (data ?? []) as EnderecoArmazem[];
    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    return { data: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  /** Lista completa (sem paginação) — usada pelo mapa de ocupação do armazém e pelos KPIs. */
  async listAll(armazemId?: string): Promise<EnderecoArmazem[]> {
    let query = supabaseAdmin.from(TABLE).select('*').is('deleted_at', null);
    if (armazemId) query = query.eq('armazem_id', armazemId);
    const { data, error } = await query;
    if (error) throw mapPgError(error);
    return (data ?? []) as EnderecoArmazem[];
  }

  async findById(id: string): Promise<EnderecoArmazem | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw mapPgError(error);
    return (data as EnderecoArmazem | null) ?? null;
  }

  async create(input: CreateEnderecoArmazemInput): Promise<EnderecoArmazem> {
    const { data, error } = await supabaseAdmin.from(TABLE).insert(input).select('*').single();
    if (error) throw mapPgError(error);
    return data as EnderecoArmazem;
  }

  async update(id: string, input: UpdateEnderecoArmazemInput): Promise<EnderecoArmazem> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(input)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error) throw mapPgError(error);
    return data as EnderecoArmazem;
  }

  async updateStatus(id: string, status: EnderecoArmazem['status']): Promise<EnderecoArmazem> {
    return this.update(id, { status } as UpdateEnderecoArmazemInput);
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw mapPgError(error);
  }

  // --------------------------------------------------------------------
  // armazens — somente leitura (a tabela pertence à migration 0001; este
  // módulo apenas lê para listar/validar o(s) armazém(ns) físico(s)).
  // --------------------------------------------------------------------
  async listArmazens(): Promise<ArmazemRow[]> {
    const { data, error } = await supabaseAdmin
      .from(ARMAZENS_TABLE)
      .select('id, nome, area_m2')
      .is('deleted_at', null);
    if (error) throw mapPgError(error);
    return (data ?? []) as ArmazemRow[];
  }

  async findArmazemById(id: string): Promise<ArmazemRow | null> {
    const { data, error } = await supabaseAdmin
      .from(ARMAZENS_TABLE)
      .select('id, nome, area_m2')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw mapPgError(error);
    return (data as ArmazemRow | null) ?? null;
  }
}
