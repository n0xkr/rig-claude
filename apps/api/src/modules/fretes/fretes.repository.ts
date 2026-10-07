import type {
  CreateFreteInput,
  CreateFreteLancamentoInput,
  CreatePagamentoFreteInput,
  Frete,
  FreteLancamento,
  PagamentoFrete,
  StatusFechamentoFrete,
  StatusFreteHistorico,
  UpdateFreteInput,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { DomainError } from '../../lib/errors.js';

const TABLE = 'fretes';
const LANCAMENTOS_TABLE = 'frete_lancamentos';
const HISTORY_TABLE = 'status_frete_historico';
const PAGAMENTOS_TABLE = 'pagamentos_frete';

export interface ListFretesFilter {
  status?: string;
  viagemId?: string;
  cursor?: string;
  limit: number;
}

/** Patch interno usado apenas pela transição de máquina de estados (nunca exposto via Zod de update genérico). */
export interface StatusFechamentoPatch {
  status_fechamento: StatusFechamentoFrete;
  aprovado_por?: string | null;
  aprovado_em?: string | null;
  pago_por?: string | null;
  pago_em?: string | null;
}

export class FretesRepository {
  async list(filter: ListFretesFilter): Promise<{ data: Frete[]; nextCursor: string | null }> {
    let query = supabaseAdmin
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .order('id', { ascending: false })
      .limit(filter.limit + 1);

    if (filter.status) {
      query = query.eq('status_fechamento', filter.status);
    }
    if (filter.viagemId) {
      query = query.eq('viagem_id', filter.viagemId);
    }
    if (filter.cursor) {
      query = query.lt('id', filter.cursor);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as Frete[];
    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1]!.id : null;
    return { data: page, nextCursor };
  }

  async findById(id: string): Promise<Frete | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as Frete | null) ?? null;
  }

  async findByViagemId(viagemId: string): Promise<Frete | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('viagem_id', viagemId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as Frete | null) ?? null;
  }

  async create(input: CreateFreteInput, createdBy: string | null): Promise<Frete> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw error;
    return data as Frete;
  }

  async update(id: string, input: UpdateFreteInput): Promise<Frete> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(input)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error) throw error;
    return data as Frete;
  }

  /** Update condicional: só aplica se o status ainda for `expected` (evita corrida entre duas transições). */
  async updateStatus(
    id: string,
    patch: StatusFechamentoPatch,
    expected?: StatusFechamentoFrete,
  ): Promise<Frete> {
    let query = supabaseAdmin.from(TABLE).update(patch).eq('id', id).is('deleted_at', null);
    if (expected) query = query.eq('status_fechamento', expected);
    const { data, error } = await query.select('*').maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new DomainError(
        'Conflito de estado',
        409,
        'O frete mudou de status durante a operação. Recarregue e tente novamente.',
      );
    }
    return data as Frete;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async insertStatusHistory(entry: {
    freteId: string;
    statusAnterior: StatusFechamentoFrete | null;
    statusNovo: StatusFechamentoFrete;
    changedBy: string | null;
    observacoes: string | null;
  }): Promise<StatusFreteHistorico> {
    const { data, error } = await supabaseAdmin
      .from(HISTORY_TABLE)
      .insert({
        frete_id: entry.freteId,
        status_anterior: entry.statusAnterior,
        status_novo: entry.statusNovo,
        changed_by: entry.changedBy,
        observacoes: entry.observacoes,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as StatusFreteHistorico;
  }

  async listStatusHistory(freteId: string): Promise<StatusFreteHistorico[]> {
    const { data, error } = await supabaseAdmin
      .from(HISTORY_TABLE)
      .select('*')
      .eq('frete_id', freteId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as StatusFreteHistorico[];
  }

  async listLancamentos(freteId: string): Promise<FreteLancamento[]> {
    const { data, error } = await supabaseAdmin
      .from(LANCAMENTOS_TABLE)
      .select('*')
      .eq('frete_id', freteId)
      .is('deleted_at', null)
      .order('data_lancamento', { ascending: false });
    if (error) throw error;
    return (data ?? []) as FreteLancamento[];
  }

  async createLancamento(
    freteId: string,
    input: CreateFreteLancamentoInput,
    createdBy: string | null,
  ): Promise<FreteLancamento> {
    const { data, error } = await supabaseAdmin
      .from(LANCAMENTOS_TABLE)
      .insert({ ...input, frete_id: freteId, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw error;
    return data as FreteLancamento;
  }

  async findLancamentoById(id: string): Promise<FreteLancamento | null> {
    const { data, error } = await supabaseAdmin
      .from(LANCAMENTOS_TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as FreteLancamento | null) ?? null;
  }

  async softDeleteLancamento(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(LANCAMENTOS_TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async listPagamentos(freteId: string): Promise<PagamentoFrete[]> {
    const { data, error } = await supabaseAdmin
      .from(PAGAMENTOS_TABLE)
      .select('*')
      .eq('frete_id', freteId)
      .is('deleted_at', null)
      .order('data_pagamento', { ascending: false });
    if (error) throw error;
    return (data ?? []) as PagamentoFrete[];
  }

  async createPagamento(
    freteId: string,
    input: CreatePagamentoFreteInput,
    createdBy: string | null,
  ): Promise<PagamentoFrete> {
    // RPC atômica (migration 0017): lock do frete + estado + limite de saldo na mesma transação.
    const { data, error } = await supabaseAdmin.rpc('registrar_pagamento_frete', {
      p_frete_id: freteId,
      p_pagamento: input,
      p_user: createdBy,
    });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') {
        const legacy = await supabaseAdmin
          .from(PAGAMENTOS_TABLE)
          .insert({ ...input, frete_id: freteId, created_by: createdBy })
          .select('*')
          .single();
        if (legacy.error) throw legacy.error;
        return legacy.data as PagamentoFrete;
      }
      if (/PAGAMENTO_EXCEDE_SALDO/.test(error.message)) {
        throw new DomainError('Pagamento excede o saldo', 422, 'O valor excede o saldo em aberto do frete');
      }
      if (/FRETE_NAO_APROVADO/.test(error.message)) {
        throw new DomainError('Frete não aprovado', 409, 'Pagamentos só após a aprovação financeira');
      }
      throw error;
    }
    return data as PagamentoFrete;
  }
}
