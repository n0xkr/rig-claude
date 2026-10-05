import type {
  CreateMovimentacaoEstoqueInput,
  Estoque,
  MovimentacaoEstoque,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { mapPgError } from './pgErrors.js';
import { calcularDeltaSaldo } from './estoqueLedger.js';
import { DomainError } from '../../lib/errors.js';

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
    const viaRpc = await this.registrarViaRpc(input, createdBy);
    if (viaRpc) return viaRpc;
    return this.registrarSequencial(input, createdBy);
  }

  /**
   * Caminho atômico (migration 0017): ledger + saldo + status do endereço numa
   * transação com lock de linha. Retorna `null` somente se a função ainda não
   * existe no banco (migration pendente) — aí cai no caminho sequencial legado.
   */
  private async registrarViaRpc(
    input: CreateMovimentacaoEstoqueInput,
    createdBy: string | null,
  ): Promise<MovimentacaoEstoque | null> {
    const delta = calcularDeltaSaldo(
      input.tipo_movimentacao,
      input.quantidade,
      Boolean(input.endereco_origem_id),
      Boolean(input.endereco_destino_id),
    );
    const { data, error } = await supabaseAdmin.rpc('registrar_movimentacao_estoque', {
      p_mov: { ...input, created_by: createdBy },
      p_origem_delta: delta.origemDelta,
      p_destino_delta: delta.destinoDelta,
    });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') return null;
      if (/SALDO_INSUFICIENTE/.test(error.message)) {
        throw new DomainError(
          'Saldo insuficiente',
          422,
          `O endereço de origem não possui saldo suficiente deste produto para a saída de ${input.quantidade}`,
        );
      }
      throw mapPgError(error);
    }
    return data as MovimentacaoEstoque;
  }

  private async registrarSequencial(
    input: CreateMovimentacaoEstoqueInput,
    createdBy: string | null,
  ): Promise<MovimentacaoEstoque> {
    // Valida o saldo ANTES de gravar no ledger: uma saída maior que o saldo do
    // endereço violaria o CHECK `chk_estoque_quantidade` (quantidade >= 0) ou,
    // pior, seria "absorvida" em silêncio (saldo truncado em 0) deixando o
    // ledger inconsistente com `estoque`.
    const deltaPrevio = calcularDeltaSaldo(
      input.tipo_movimentacao,
      input.quantidade,
      Boolean(input.endereco_origem_id),
      Boolean(input.endereco_destino_id),
    );
    if (input.endereco_origem_id && deltaPrevio.origemDelta < 0) {
      const saldo = await this.getSaldo(input.produto_id, input.endereco_origem_id);
      if (saldo + deltaPrevio.origemDelta < 0) {
        throw new DomainError(
          'Saldo insuficiente',
          422,
          `O endereço de origem possui saldo ${saldo} deste produto, insuficiente para a saída de ${input.quantidade}`,
        );
      }
    }

    const { data, error } = await supabaseAdmin
      .from(MOVIMENTACOES_TABLE)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw mapPgError(error);
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
    if (findError) throw mapPgError(findError);

    const saldoAtual = (existente as Estoque | null)?.quantidade ?? 0;
    const novoSaldo = Math.max(0, saldoAtual + delta);

    if (existente) {
      const { error } = await supabaseAdmin
        .from(ESTOQUE_TABLE)
        .update({ quantidade: novoSaldo, updated_at: new Date().toISOString() })
        .eq('id', (existente as Estoque).id);
      if (error) throw mapPgError(error);
    } else {
      const { error } = await supabaseAdmin
        .from(ESTOQUE_TABLE)
        .insert({ produto_id: produtoId, endereco_id: enderecoId, quantidade: novoSaldo });
      if (error) throw mapPgError(error);
    }

    await this.sincronizarStatusEndereco(enderecoId);
  }

  /**
   * Mantém `enderecos_armazem.status` coerente com o saldo real de `estoque`
   * (o mapa/KPI de ocupação lê esse status): endereço com saldo > 0 passa a
   * OCUPADO e, ao zerar, volta a LIVRE. Endereços BLOQUEADOS nunca são alterados.
   */
  private async sincronizarStatusEndereco(enderecoId: string): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from(ESTOQUE_TABLE)
      .select('quantidade')
      .eq('endereco_id', enderecoId)
      .gt('quantidade', 0)
      .limit(1);
    if (error) throw mapPgError(error);
    const temSaldo = (data ?? []).length > 0;

    const { error: updError } = await supabaseAdmin
      .from('enderecos_armazem')
      .update({ status: temSaldo ? 'OCUPADO' : 'LIVRE' })
      .eq('id', enderecoId)
      .neq('status', 'BLOQUEADO')
      .neq('status', temSaldo ? 'OCUPADO' : 'LIVRE');
    if (updError) throw mapPgError(updError);
  }

  async getSaldo(produtoId: string, enderecoId: string): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from(ESTOQUE_TABLE)
      .select('quantidade')
      .eq('produto_id', produtoId)
      .eq('endereco_id', enderecoId)
      .maybeSingle();
    if (error) throw mapPgError(error);
    return (data as { quantidade: number } | null)?.quantidade ?? 0;
  }

  async listSaldosByProduto(produtoId: string): Promise<Estoque[]> {
    const { data, error } = await supabaseAdmin
      .from(ESTOQUE_TABLE)
      .select('*')
      .eq('produto_id', produtoId)
      .gt('quantidade', 0);
    if (error) throw mapPgError(error);
    return (data ?? []) as Estoque[];
  }

  async listSaldoTotalPorProduto(produtoId: string): Promise<number> {
    const saldos = await this.listSaldosByProduto(produtoId);
    return saldos.reduce((acc, s) => acc + s.quantidade, 0);
  }

  /** Saldos (>0) de todos os endereços informados — usado para snapshotar um inventário/contagem física por armazém. Consulta em lotes para não estourar o limite de tamanho da URL do PostgREST (`in.(...)` com centenas de UUIDs). */
  async listSaldosPorEnderecos(enderecoIds: string[]): Promise<Estoque[]> {
    const resultado: Estoque[] = [];
    for (let i = 0; i < enderecoIds.length; i += 100) {
      const { data, error } = await supabaseAdmin
        .from(ESTOQUE_TABLE)
        .select('*')
        .in('endereco_id', enderecoIds.slice(i, i + 100))
        .gt('quantidade', 0);
      if (error) throw mapPgError(error);
      resultado.push(...((data ?? []) as Estoque[]));
    }
    return resultado;
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
    if (error) throw mapPgError(error);
    return (data as MovimentacaoEstoque | null) ?? null;
  }

  async listMovimentacoesByProduto(produtoId: string, limit = 100): Promise<MovimentacaoEstoque[]> {
    const { data, error } = await supabaseAdmin
      .from(MOVIMENTACOES_TABLE)
      .select('*')
      .eq('produto_id', produtoId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw mapPgError(error);
    return (data ?? []) as MovimentacaoEstoque[];
  }

  async listMovimentacoesByFilter(filter: {
    recebimentoId?: string;
    expedicaoId?: string;
    inventarioId?: string;
    produtoId?: string;
    tipo?: MovimentacaoEstoque['tipo_movimentacao'];
    periodStart?: string;
    periodEnd?: string;
    limit?: number;
  }): Promise<MovimentacaoEstoque[]> {
    let query = supabaseAdmin.from(MOVIMENTACOES_TABLE).select('*');
    if (filter.recebimentoId) query = query.eq('recebimento_id', filter.recebimentoId);
    if (filter.expedicaoId) query = query.eq('expedicao_id', filter.expedicaoId);
    if (filter.inventarioId) query = query.eq('inventario_id', filter.inventarioId);
    if (filter.produtoId) query = query.eq('produto_id', filter.produtoId);
    if (filter.tipo) query = query.eq('tipo_movimentacao', filter.tipo);
    if (filter.periodStart) query = query.gte('created_at', filter.periodStart);
    if (filter.periodEnd) query = query.lte('created_at', filter.periodEnd);
    if (filter.limit) query = query.limit(filter.limit);
    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) throw mapPgError(error);
    return (data ?? []) as MovimentacaoEstoque[];
  }
}
