import type {
  AtualizarQuilometragemViagemInput,
  CreateManutencaoVeiculoInput,
  ManutencaoVeiculo,
  UpdateManutencaoVeiculoInput,
  Veiculo,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';

const MANUTENCOES_TABLE = 'manutencoes_veiculo';
const VEICULOS_TABLE = 'veiculos';
const VIAGENS_TABLE = 'viagens';
const FRETES_TABLE = 'fretes';

/** Status de viagem considerados "encerrados" para fins de disponibilidade de frota (critério "Veículos disponíveis vs em viagem"): fora desse conjunto, o veículo está comprometido com uma viagem em andamento. */
const STATUS_VIAGEM_TERMINAIS = ['ENTREGUE', 'ENCERRADA', 'CANCELADA'];

export interface ListManutencoesFilter {
  veiculoId?: string;
  cursor?: string;
  limit: number;
}

export interface FrotaKpiFilter {
  veiculoId?: string;
  periodStart?: string;
  periodEnd?: string;
}

/** Subconjunto de colunas de `viagens` relevante para os KPIs de frota — nunca lê/escreve nada além das 3 colunas próprias do Módulo 4 mais as usadas apenas para agrupar (id, veiculo_id, status, data_programacao). */
export interface ViagemFrotaRow {
  id: string;
  veiculo_id: string | null;
  status: string;
  km_rodado: number | null;
  km_vazio: number | null;
  consumo_combustivel_litros: number | null;
  data_programacao: string;
}

export interface ManutencaoKpiRow {
  veiculo_id: string;
  custo: number;
  data_manutencao: string;
}

export class FrotaRepository {
  // --------------------------------------------------------------------
  // manutencoes_veiculo — CRUD
  // --------------------------------------------------------------------
  async listManutencoes(
    filter: ListManutencoesFilter,
  ): Promise<{ data: ManutencaoVeiculo[]; nextCursor: string | null }> {
    let query = supabaseAdmin
      .from(MANUTENCOES_TABLE)
      .select('*')
      .is('deleted_at', null)
      .order('id', { ascending: false })
      .limit(filter.limit + 1);

    if (filter.veiculoId) query = query.eq('veiculo_id', filter.veiculoId);
    if (filter.cursor) query = query.lt('id', filter.cursor);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as ManutencaoVeiculo[];
    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    return { data: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  async findManutencaoById(id: string): Promise<ManutencaoVeiculo | null> {
    const { data, error } = await supabaseAdmin
      .from(MANUTENCOES_TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as ManutencaoVeiculo | null) ?? null;
  }

  async createManutencao(
    input: CreateManutencaoVeiculoInput,
    createdBy: string | null,
  ): Promise<ManutencaoVeiculo> {
    const { data, error } = await supabaseAdmin
      .from(MANUTENCOES_TABLE)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw error;
    return data as ManutencaoVeiculo;
  }

  async updateManutencao(
    id: string,
    input: UpdateManutencaoVeiculoInput,
  ): Promise<ManutencaoVeiculo> {
    const { data, error } = await supabaseAdmin
      .from(MANUTENCOES_TABLE)
      .update(input)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error) throw error;
    return data as ManutencaoVeiculo;
  }

  async softDeleteManutencao(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(MANUTENCOES_TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async listManutencoesParaKpis(filter: FrotaKpiFilter): Promise<ManutencaoKpiRow[]> {
    let query = supabaseAdmin
      .from(MANUTENCOES_TABLE)
      .select('veiculo_id, custo, data_manutencao')
      .is('deleted_at', null);
    if (filter.veiculoId) query = query.eq('veiculo_id', filter.veiculoId);
    if (filter.periodStart) query = query.gte('data_manutencao', filter.periodStart);
    if (filter.periodEnd) query = query.lte('data_manutencao', filter.periodEnd);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ManutencaoKpiRow[];
  }

  // --------------------------------------------------------------------
  // veiculos — somente leitura, para os KPIs de frota
  // --------------------------------------------------------------------
  async listVeiculos(): Promise<Veiculo[]> {
    const { data, error } = await supabaseAdmin
      .from(VEICULOS_TABLE)
      .select('*')
      .is('deleted_at', null);
    if (error) throw error;
    return (data ?? []) as Veiculo[];
  }

  /** IDs de veículos atualmente comprometidos com uma viagem em andamento (status fora do conjunto terminal) — nunca filtrado por período, pois é sempre o estado ATUAL. */
  async listVeiculoIdsEmViagem(): Promise<Set<string>> {
    const { data, error } = await supabaseAdmin
      .from(VIAGENS_TABLE)
      .select('veiculo_id')
      .is('deleted_at', null)
      .not('veiculo_id', 'is', null)
      .not('status', 'in', `(${STATUS_VIAGEM_TERMINAIS.join(',')})`);
    if (error) throw error;
    return new Set((data ?? []).map((row) => row.veiculo_id as string));
  }

  // --------------------------------------------------------------------
  // viagens — somente as colunas próprias do Módulo 4 (km/consumo) + as
  // usadas apenas para agrupar/filtrar. Nunca escreve nada do Módulo 2.
  // --------------------------------------------------------------------
  async listViagensParaKpis(filter: FrotaKpiFilter): Promise<ViagemFrotaRow[]> {
    let query = supabaseAdmin
      .from(VIAGENS_TABLE)
      .select(
        'id, veiculo_id, status, km_rodado, km_vazio, consumo_combustivel_litros, data_programacao',
      )
      .is('deleted_at', null);
    if (filter.veiculoId) query = query.eq('veiculo_id', filter.veiculoId);
    if (filter.periodStart) query = query.gte('data_programacao', filter.periodStart);
    if (filter.periodEnd) query = query.lte('data_programacao', filter.periodEnd);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ViagemFrotaRow[];
  }

  async updateQuilometragem(
    viagemId: string,
    patch: AtualizarQuilometragemViagemInput,
  ): Promise<ViagemFrotaRow> {
    const { data, error } = await supabaseAdmin
      .from(VIAGENS_TABLE)
      .update(patch)
      .eq('id', viagemId)
      .is('deleted_at', null)
      .select(
        'id, veiculo_id, status, km_rodado, km_vazio, consumo_combustivel_litros, data_programacao',
      )
      .single();
    if (error) throw error;
    return data as ViagemFrotaRow;
  }

  // --------------------------------------------------------------------
  // fretes — somente leitura de `retorno_vazio` (Módulo 3), para cruzar
  // (nunca duplicar) com os KPIs de frota (critério "km vazio").
  // --------------------------------------------------------------------
  async listRetornoVazioByViagemIds(
    viagemIds: string[],
  ): Promise<Array<{ viagem_id: string; retorno_vazio: boolean }>> {
    if (viagemIds.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from(FRETES_TABLE)
      .select('viagem_id, retorno_vazio')
      .in('viagem_id', viagemIds)
      .is('deleted_at', null);
    if (error) throw error;
    return (data ?? []) as Array<{ viagem_id: string; retorno_vazio: boolean }>;
  }
}
