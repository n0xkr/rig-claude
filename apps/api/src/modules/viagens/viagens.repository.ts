import type {
  OrigemEventoViagem,
  StatusViagem,
  StatusViagemHistorico,
  Viagem,
  ViagemCarga,
  ViagemCargaInput,
  ViagemMotoristaHistorico,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { fromPgError } from '../../lib/pgConstraintErrors.js';
import { erroMigration0014, faltaMigration0014 } from '../../lib/schemaPendente.js';

const TABLE = 'viagens';
const HISTORY_TABLE = 'status_viagem_historico';
const CARGAS_TABLE = 'viagem_cargas';
const MOTORISTA_HIST_TABLE = 'viagem_motorista_historico';

export interface ListViagensFilter {
  /** Um status ou vários separados por vírgula. */
  status?: string;
  cursor?: string;
  limit: number;
}

/** Linha gravável de `viagens` (sem as cargas, que vão para `viagem_cargas`). */
export type ViagemRow = Record<string, unknown>;

function falha(error: { code?: string; message?: string }): unknown {
  return faltaMigration0014(error) ? erroMigration0014() : fromPgError(error);
}

export class ViagensRepository {
  async list(filter: ListViagensFilter): Promise<{ data: Viagem[]; nextCursor: string | null }> {
    let query = supabaseAdmin
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .order('id', { ascending: false })
      .limit(filter.limit + 1);

    const status = (filter.status ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (status.length === 1) query = query.eq('status', status[0]!);
    else if (status.length > 1) query = query.in('status', status);
    if (filter.cursor) {
      query = query.lt('id', filter.cursor);
    }

    const { data, error } = await query;
    if (error) throw falha(error);

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
    if (error) throw fromPgError(error);
    return (data as Viagem | null) ?? null;
  }

  async findByCrt(numeroCrt: string): Promise<Viagem | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('numero_crt', numeroCrt)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw fromPgError(error);
    return (data as Viagem | null) ?? null;
  }

  async create(row: ViagemRow, createdBy: string | null): Promise<Viagem> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({ ...row, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw falha(error);
    return data as Viagem;
  }

  async update(id: string, row: ViagemRow): Promise<Viagem> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(row)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error) throw falha(error);
    return data as Viagem;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw fromPgError(error);
  }

  // ----- cargas (CRT/DANFE) ------------------------------------------------------

  /** Sem a migration 0014 a tabela não existe: devolve lista vazia (a tela continua funcionando). */
  async listCargas(viagemId: string): Promise<ViagemCarga[]> {
    const { data, error } = await supabaseAdmin
      .from(CARGAS_TABLE)
      .select('*')
      .eq('viagem_id', viagemId)
      .order('created_at', { ascending: true });
    if (error) {
      if (faltaMigration0014(error)) return [];
      throw fromPgError(error);
    }
    return (data ?? []) as ViagemCarga[];
  }

  /** Substitui o conjunto de cargas da viagem pelo informado (edição da tela / reimportação). */
  async replaceCargas(viagemId: string, cargas: ViagemCargaInput[]): Promise<ViagemCarga[]> {
    const { error: delError } = await supabaseAdmin
      .from(CARGAS_TABLE)
      .delete()
      .eq('viagem_id', viagemId);
    if (delError) throw falha(delError);
    if (cargas.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from(CARGAS_TABLE)
      .insert(cargas.map((c) => ({ ...c, viagem_id: viagemId })))
      .select('*');
    if (error) throw falha(error);
    return (data ?? []) as ViagemCarga[];
  }

  // ----- histórico de motorista ----------------------------------------------------

  async insertMotoristaHistorico(entry: {
    viagemId: string;
    anterior: string | null;
    novo: string | null;
    motivo: string | null;
    changedBy: string | null;
  }): Promise<void> {
    const { error } = await supabaseAdmin.from(MOTORISTA_HIST_TABLE).insert({
      viagem_id: entry.viagemId,
      motorista_anterior_id: entry.anterior,
      motorista_novo_id: entry.novo,
      motivo: entry.motivo,
      changed_by: entry.changedBy,
    });
    if (error) throw falha(error);
  }

  async listMotoristaHistorico(viagemId: string): Promise<ViagemMotoristaHistorico[]> {
    const { data, error } = await supabaseAdmin
      .from(MOTORISTA_HIST_TABLE)
      .select('*')
      .eq('viagem_id', viagemId)
      .order('created_at', { ascending: true });
    if (error) {
      if (faltaMigration0014(error)) return [];
      throw fromPgError(error);
    }
    const rows = (data ?? []) as ViagemMotoristaHistorico[];
    const ids = [
      ...new Set(
        rows.flatMap((r) => [r.motorista_anterior_id, r.motorista_novo_id]).filter(Boolean),
      ),
    ] as string[];
    if (ids.length === 0) return rows;
    const { data: mots } = await supabaseAdmin
      .from('motoristas')
      .select('id, nome_completo')
      .in('id', ids);
    const nome = new Map(
      ((mots ?? []) as Array<{ id: string; nome_completo: string }>).map((m) => [
        m.id,
        m.nome_completo,
      ]),
    );
    return rows.map((r) => ({
      ...r,
      motorista_anterior_nome: r.motorista_anterior_id
        ? (nome.get(r.motorista_anterior_id) ?? null)
        : null,
      motorista_novo_nome: r.motorista_novo_id ? (nome.get(r.motorista_novo_id) ?? null) : null,
    }));
  }

  // ----- histórico de status --------------------------------------------------------

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
    if (error) throw falha(error);
    return data as StatusViagemHistorico;
  }

  async listStatusHistory(viagemId: string): Promise<StatusViagemHistorico[]> {
    const { data, error } = await supabaseAdmin
      .from(HISTORY_TABLE)
      .select('*')
      .eq('viagem_id', viagemId)
      .order('created_at', { ascending: true });
    if (error) throw fromPgError(error);
    return (data ?? []) as StatusViagemHistorico[];
  }
}
