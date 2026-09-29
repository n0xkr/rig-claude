import type {
  AtualizarQuilometragemViagemInput,
  CreateManutencaoVeiculoInput,
  ManutencaoVeiculo,
  UpdateManutencaoVeiculoInput,
  Veiculo,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { fetchAllPages, periodoFimTs, periodoInicioTs } from '../../lib/fetchAllPages.js';

const MANUTENCOES_TABLE = 'manutencoes_veiculo';
const VEICULOS_TABLE = 'veiculos';
const VIAGENS_TABLE = 'viagens';
const FRETES_TABLE = 'fretes';

/** Status de viagem considerados "encerrados" para fins de disponibilidade de frota (critério "Veículos disponíveis vs em viagem"): fora desse conjunto, o veículo está comprometido com uma viagem em andamento. */
const VIAGEM_FROTA_COLUMNS =
  'id, veiculo_id, placa_cavalo, status, km_rodado, km_vazio, consumo_combustivel_litros, data_programacao';

const IN_CHUNK_SIZE = 100;

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

/** Subconjunto de colunas de `viagens` relevante para os KPIs de frota — nunca lê/escreve nada além das 3 colunas próprias do Módulo 4 mais as usadas apenas para agrupar (id, veiculo_id, placa_cavalo, status, data_programacao). `veiculo_id` é opcional no banco (só `placa_cavalo` é NOT NULL), então a viagem também é atribuída ao veículo pela placa. */
export interface ViagemFrotaRow {
  id: string;
  veiculo_id: string | null;
  placa_cavalo: string;
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
    // Paginado: agregação precisa de todas as linhas (PostgREST trunca em 1000).
    return fetchAllPages<ManutencaoKpiRow>((from, to) => {
      let query = supabaseAdmin
        .from(MANUTENCOES_TABLE)
        .select('veiculo_id, custo, data_manutencao')
        .is('deleted_at', null)
        .order('id', { ascending: true });
      if (filter.veiculoId) query = query.eq('veiculo_id', filter.veiculoId);
      if (filter.periodStart) query = query.gte('data_manutencao', filter.periodStart);
      if (filter.periodEnd) query = query.lte('data_manutencao', filter.periodEnd);
      return query.range(from, to);
    });
  }

  // --------------------------------------------------------------------
  // veiculos — somente leitura, para os KPIs de frota
  // --------------------------------------------------------------------
  async listVeiculos(): Promise<Veiculo[]> {
    return fetchAllPages<Veiculo>((from, to) =>
      supabaseAdmin
        .from(VEICULOS_TABLE)
        .select('*')
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(from, to),
    );
  }

  /** IDs e placas de veículos atualmente comprometidos com uma viagem em andamento (status fora do conjunto terminal) — nunca filtrado por período, pois é sempre o estado ATUAL. Retorna também as placas porque `viagens.veiculo_id` é opcional (só `placa_cavalo` é obrigatória). */
  async listVeiculosEmViagem(): Promise<{ ids: Set<string>; placas: Set<string> }> {
    const rows = await fetchAllPages<{ veiculo_id: string | null; placa_cavalo: string }>(
      (from, to) =>
        supabaseAdmin
          .from(VIAGENS_TABLE)
          .select('veiculo_id, placa_cavalo')
          .is('deleted_at', null)
          .not('status', 'in', `(${STATUS_VIAGEM_TERMINAIS.join(',')})`)
          .order('id', { ascending: true })
          .range(from, to),
    );
    return {
      ids: new Set(rows.flatMap((row) => (row.veiculo_id ? [row.veiculo_id] : []))),
      placas: new Set(rows.map((row) => row.placa_cavalo)),
    };
  }

  // --------------------------------------------------------------------
  // viagens — somente as colunas próprias do Módulo 4 (km/consumo) + as
  // usadas apenas para agrupar/filtrar. Nunca escreve nada do Módulo 2.
  // --------------------------------------------------------------------
  async listViagensParaKpis(filter: FrotaKpiFilter): Promise<ViagemFrotaRow[]> {
    // Paginado: agregação precisa de todas as linhas (PostgREST trunca em 1000).
    // O filtro por veículo é aplicado no serviço (por id OU placa), pois `veiculo_id` pode ser nulo.
    return fetchAllPages<ViagemFrotaRow>((from, to) => {
      let query = supabaseAdmin
        .from(VIAGENS_TABLE)
        .select(VIAGEM_FROTA_COLUMNS)
        .is('deleted_at', null)
        .order('id', { ascending: true });
      // `data_programacao` é timestamptz: as datas do filtro viram limites de dia inteiro.
      if (filter.periodStart) query = query.gte('data_programacao', periodoInicioTs(filter.periodStart));
      if (filter.periodEnd) query = query.lte('data_programacao', periodoFimTs(filter.periodEnd));
      return query.range(from, to);
    });
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
      .select(VIAGEM_FROTA_COLUMNS)
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
    const rows: Array<{ viagem_id: string; retorno_vazio: boolean }> = [];
    // Em lotes: `.in()` com milhares de UUIDs estoura o limite de tamanho da URL do PostgREST.
    for (let i = 0; i < viagemIds.length; i += IN_CHUNK_SIZE) {
      const { data, error } = await supabaseAdmin
        .from(FRETES_TABLE)
        .select('viagem_id, retorno_vazio')
        .in('viagem_id', viagemIds.slice(i, i + IN_CHUNK_SIZE))
        .is('deleted_at', null);
      if (error) throw error;
      rows.push(...((data ?? []) as Array<{ viagem_id: string; retorno_vazio: boolean }>));
    }
    return rows;
  }
}
