import type { CreateRegistroJornadaInput, RegistroJornada } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { fetchAllPages, periodoFimTs, periodoInicioTs } from '../../lib/fetchAllPages.js';

const TABLE = 'registros_jornada';
const MOTORISTAS_TABLE = 'motoristas';

export interface ListEventosFilter {
  periodStart?: string;
  periodEnd?: string;
}

export class JornadaRepository {
  async create(
    input: CreateRegistroJornadaInput,
    createdBy: string | null,
  ): Promise<RegistroJornada> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw error;
    return data as RegistroJornada;
  }

  /** Último evento (não deletado) do motorista, usado para validar a máquina de estados antes de aceitar o próximo evento (critério #1). */
  async findUltimoEventoByMotorista(motoristaId: string): Promise<RegistroJornada | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('motorista_id', motoristaId)
      .is('deleted_at', null)
      .order('timestamp_evento', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as RegistroJornada | null) ?? null;
  }

  async findById(id: string): Promise<RegistroJornada | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as RegistroJornada | null) ?? null;
  }

  async listByMotorista(
    motoristaId: string,
    filter: ListEventosFilter = {},
  ): Promise<RegistroJornada[]> {
    // Paginado: um motorista acumula milhares de eventos e o PostgREST trunca em 1000 linhas.
    return fetchAllPages<RegistroJornada>((from, to) => {
      let query = supabaseAdmin
        .from(TABLE)
        .select('*')
        .eq('motorista_id', motoristaId)
        .is('deleted_at', null)
        .order('timestamp_evento', { ascending: true })
        .order('id', { ascending: true });
      if (filter.periodStart) {
        query = query.gte('timestamp_evento', periodoInicioTs(filter.periodStart));
      }
      if (filter.periodEnd) query = query.lte('timestamp_evento', periodoFimTs(filter.periodEnd));
      return query.range(from, to);
    });
  }

  /**
   * Eventos (não deletados) dos motoristas informados, a partir de uma data
   * mínima, ordenados por motorista e timestamp — usado pelo painel de
   * alertas de conformidade (critério "identificação de excessos e alertas
   * imediatos"). Recebe a lista de IDs já filtrada por `ativo = true`
   * (buscada via `MotoristasRepository`) em vez de fazer join embutido, para
   * não depender de sintaxe de filtro em recurso aninhado do PostgREST.
   */
  async listEventosPorMotoristas(
    motoristaIds: string[],
    sinceIso: string,
  ): Promise<RegistroJornada[]> {
    if (motoristaIds.length === 0) return [];
    // Paginado: a janela de alertas cobre todos os motoristas ativos e passaria de 1000 linhas (truncadas pelo PostgREST).
    return fetchAllPages<RegistroJornada>((from, to) =>
      supabaseAdmin
        .from(TABLE)
        .select('*')
        .in('motorista_id', motoristaIds)
        .is('deleted_at', null)
        .gte('timestamp_evento', sinceIso)
        .order('motorista_id', { ascending: true })
        .order('timestamp_evento', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    );
  }

  /**
   * IDs e nomes dos motoristas ativos — leitura direta e mínima da tabela
   * `motoristas` (só `id`/`nome_completo`), feita aqui em vez de reaproveitar
   * `MotoristasRepository` (Módulo 1) para manter o Módulo 4 autocontido sem
   * criar uma dependência de import entre módulos só para esta consulta.
   */
  async listMotoristaIdsAtivos(): Promise<Array<{ id: string; nome_completo: string }>> {
    const { data, error } = await supabaseAdmin
      .from(MOTORISTAS_TABLE)
      .select('id, nome_completo')
      .eq('ativo', true)
      .is('deleted_at', null);
    if (error) throw error;
    return (data ?? []) as Array<{ id: string; nome_completo: string }>;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }
}
