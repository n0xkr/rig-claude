import type {
  CreateViagemInput,
  OrigemEventoViagem,
  StatusViagem,
  StatusViagemHistorico,
  UpdateViagemInput,
  Viagem,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';

const TABLE = 'viagens';
const HISTORY_TABLE = 'status_viagem_historico';

export interface ListViagensFilter {
  status?: string;
  cursor?: string;
  limit: number;
}

export class ViagensRepository {
  async list(filter: ListViagensFilter): Promise<{ data: Viagem[]; nextCursor: string | null }> {
    let query = supabaseAdmin
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .order('id', { ascending: false })
      .limit(filter.limit + 1);

    if (filter.status) {
      query = query.eq('status', filter.status);
    }
    if (filter.cursor) {
      query = query.lt('id', filter.cursor);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as Viagem[];
    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1]!.id : null;
    return { data: page, nextCursor };
  }

  async findById(id: string): Promise<Viagem | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as Viagem | null) ?? null;
  }

  async findByCrt(numeroCrt: string): Promise<Viagem | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('numero_crt', numeroCrt)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as Viagem | null) ?? null;
  }

  async create(input: CreateViagemInput, createdBy: string | null): Promise<Viagem> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw error;
    return data as Viagem;
  }

  async update(id: string, input: UpdateViagemInput): Promise<Viagem> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(input)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error) throw error;
    return data as Viagem;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  /**
   * `origemEvento` (Módulo 6, default 'MANUAL') distingue uma transição real
   * de status (Módulo 2) de uma nota informativa disparada pelo WMS
   * (Módulo 5) — ver migration 0007. Uma nota WMS pode gravar
   * `statusAnterior === statusNovo` (não é uma transição de fato).
   */
  async insertStatusHistory(entry: {
    viagemId: string;
    statusAnterior: StatusViagem | null;
    statusNovo: StatusViagem;
    changedBy: string | null;
    observacoes: string | null;
    origemEvento?: OrigemEventoViagem;
  }): Promise<StatusViagemHistorico> {
    const { data, error } = await supabaseAdmin
      .from(HISTORY_TABLE)
      .insert({
        viagem_id: entry.viagemId,
        status_anterior: entry.statusAnterior,
        status_novo: entry.statusNovo,
        changed_by: entry.changedBy,
        observacoes: entry.observacoes,
        origem_evento: entry.origemEvento ?? 'MANUAL',
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as StatusViagemHistorico;
  }

  async listStatusHistory(viagemId: string): Promise<StatusViagemHistorico[]> {
    const { data, error } = await supabaseAdmin
      .from(HISTORY_TABLE)
      .select('*')
      .eq('viagem_id', viagemId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as StatusViagemHistorico[];
  }
}
