import type { CreateEventoFronteiraInput, EventoFronteira, Viagem } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { fromPgError } from '../../lib/pgConstraintErrors.js';

const TABLE = 'eventos_fronteira';

export interface FronteiraKpiFilter {
  rota?: string;
  periodStart?: string;
  periodEnd?: string;
}

export class FronteiraRepository {
  async listByViagem(viagemId: string): Promise<EventoFronteira[]> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('viagem_id', viagemId)
      .is('deleted_at', null)
      .order('timestamp_etapa', { ascending: true });
    if (error) throw fromPgError(error);
    return (data ?? []) as EventoFronteira[];
  }

  async create(
    input: CreateEventoFronteiraInput,
    createdBy: string | null,
  ): Promise<EventoFronteira> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw fromPgError(error);
    return data as EventoFronteira;
  }

  /**
   * Busca todos os eventos de fronteira (não deletados) dentro do período,
   * junto com os dados da viagem correspondente (para agrupar por rota).
   * Usado exclusivamente pelo cálculo de KPIs (critério #2 do Módulo 2).
   */
  async listEventosParaKpis(
    filter: FronteiraKpiFilter,
  ): Promise<Array<EventoFronteira & { viagem: Viagem | null }>> {
    let query = supabaseAdmin
      .from(TABLE)
      .select('*, viagem:viagens(*)')
      .is('deleted_at', null)
      .order('viagem_id', { ascending: true })
      .order('timestamp_etapa', { ascending: true });

    if (filter.periodStart) {
      query = query.gte('timestamp_etapa', filter.periodStart);
    }
    if (filter.periodEnd) {
      query = query.lte('timestamp_etapa', filter.periodEnd);
    }

    const { data, error } = await query;
    if (error) throw fromPgError(error);
    // Eventos de viagens removidas (soft delete) não entram nos KPIs.
    return ((data ?? []) as unknown as Array<EventoFronteira & { viagem: Viagem | null }>).filter(
      (e) => !e.viagem?.deleted_at,
    );
  }
}
