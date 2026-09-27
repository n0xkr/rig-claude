import type {
  CreateMovimentacaoEstoqueInput,
  Estoque,
  MovimentacaoEstoque,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { calcularDeltaSaldo } from './estoqueLedger.js';

const MOVIMENTACOES_TABLE = 'movimentacoes_estoque';
const ESTOQUE_TABLE = 'estoque';

/**
 * Repositório do ledger de estoque (`movimentacoes_estoque`, fonte da
 * verdade) e do saldo materializado (`estoque`, derivado — ver nota de
 * modelagem na migration 0006). Todo escritor de estoque do Módulo 5
 * (recebimento, separação, expedição, avaria, inventário) passa por
 * `registrarMovimentacao`, nunca escreve `estoque` diretamente.
 */
export class EstoqueRepository {
  async registrarMovimentacao(
    input: CreateMovimentacaoEstoqueInput,
    createdBy: string | null,
  ): Promise<MovimentacaoEstoque> {
    const { data, error } = await supabaseAdmin
      .from(MOVIMENTACOES_TABLE)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw error;
    const movimentacao = data as MovimentacaoEstoque;

    const delta = calcularDeltaSaldo(
      movimentacao.tipo_movimentacao,
      movimentacao.quantidade,
      Boolean(movimentacao.endereco_origem_id),
      Boolean(movimentacao.endereco_destino_id),
    );

    if (movimentacao.endereco_origem_id && delta.origemDelta !== 0) {
      await this.aplicarDeltaSaldo(
        movimentacao.produto_id,
        movimentacao.endereco_origem_id,
        delta.origemDelta,
      );
    }
    if (movimentacao.endereco_destino_id && delta.destinoDelta !== 0) {
      await this.aplicarDeltaSaldo(
        movimentacao.produto_id,
        movimentacao.endereco_destino_id,
        delta.destinoDelta,
      );
    }

    return movimentacao;
  }

  /** Aplica um delta ao saldo materializado (produto x endereço), criando a linha se ainda não existir. Nunca deixa o saldo negativo (constraint de banco `chk_estoque_quantidade`). */
  private async aplicarDeltaSaldo(
    produtoId: string,
    enderecoId: string,
    delta: number,
  ): Promise<void> {
    const { data: existente, error: findError } = await supabaseAdmin
      .from(ESTOQUE_TABLE)
      .select('*')
      .eq('produto_id', produtoId)
      .eq('endereco_id', enderecoId)
      .maybeSingle();
    if (findError) throw findError;

    const saldoAtual = (existente as Estoque | null)?.quantidade ?? 0;
    const novoSaldo = Math.max(0, saldoAtual + delta);

    if (existente) {
      const { error } = await supabaseAdmin
        .from(ESTOQUE_TABLE)
        .update({ quantidade: novoSaldo, updated_at: new Date().toISOString() })
        .eq('id', (existente as Estoque).id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from(ESTOQUE_TABLE)
        .insert({ produto_id: produtoId, endereco_id: enderecoId, quantidade: novoSaldo });
      if (error) throw error;
    }
  }

  async getSaldo(produtoId: string, enderecoId: string): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from(ESTOQUE_TABLE)
      .select('quantidade')
      .eq('produto_id', produtoId)
      .eq('endereco_id', enderecoId)
      .maybeSingle();
    if (error) throw error;
    return (data as { quantidade: number } | null)?.quantidade ?? 0;
  }

  async listSaldosByProduto(produtoId: string): Promise<Estoque[]> {
    const { data, error } = await supabaseAdmin
      .from(ESTOQUE_TABLE)
      .select('*')
      .eq('produto_id', produtoId)
      .gt('quantidade', 0);
    if (error) throw error;
    return (data ?? []) as Estoque[];
  }

  async listSaldoTotalPorProduto(produtoId: string): Promise<number> {
    const saldos = await this.listSaldosByProduto(produtoId);
    return saldos.reduce((acc, s) => acc + s.quantidade, 0);
  }

  /** Saldos (>0) de todos os endereços informados — usado para snapshotar um inventário/contagem física por armazém. */
  async listSaldosPorEnderecos(enderecoIds: string[]): Promise<Estoque[]> {
    if (enderecoIds.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from(ESTOQUE_TABLE)
      .select('*')
      .in('endereco_id', enderecoIds)
      .gt('quantidade', 0);
    if (error) throw error;
    return (data ?? []) as Estoque[];
  }

  /** Saldo total (soma de todos os endereços de um armazém) — usado pelos KPIs (giro de estoque). */
  async listSaldoTotalPorEnderecos(enderecoIds: string[]): Promise<number> {
    const saldos = await this.listSaldosPorEnderecos(enderecoIds);
    return saldos.reduce((acc, s) => acc + s.quantidade, 0);
  }

  async findMovimentacaoById(id: string): Promise<MovimentacaoEstoque | null> {
    const { data, error } = await supabaseAdmin
      .from(MOVIMENTACOES_TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as MovimentacaoEstoque | null) ?? null;
  }

  async listMovimentacoesByProduto(produtoId: string, limit = 100): Promise<MovimentacaoEstoque[]> {
    const { data, error } = await supabaseAdmin
      .from(MOVIMENTACOES_TABLE)
      .select('*')
      .eq('produto_id', produtoId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as MovimentacaoEstoque[];
  }

  async listMovimentacoesByFilter(filter: {
    recebimentoId?: string;
    expedicaoId?: string;
    inventarioId?: string;
    periodStart?: string;
    periodEnd?: string;
  }): Promise<MovimentacaoEstoque[]> {
    let query = supabaseAdmin.from(MOVIMENTACOES_TABLE).select('*');
    if (filter.recebimentoId) query = query.eq('recebimento_id', filter.recebimentoId);
    if (filter.expedicaoId) query = query.eq('expedicao_id', filter.expedicaoId);
    if (filter.inventarioId) query = query.eq('inventario_id', filter.inventarioId);
    if (filter.periodStart) query = query.gte('created_at', filter.periodStart);
    if (filter.periodEnd) query = query.lte('created_at', filter.periodEnd);
    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as MovimentacaoEstoque[];
  }
}
