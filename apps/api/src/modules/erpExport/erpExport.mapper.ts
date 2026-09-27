import type {
  ErpEstoqueRecord,
  ErpFinanceiroRecord,
  Frete,
  SaldoFrete,
  TipoMovimentacaoEstoque,
} from '@rigabras/shared';

/** Linha crua de `movimentacoes_estoque` com o join de `produtos_armazenados` (sku/depositante), como devolvida pelo Supabase. */
export interface MovimentacaoRowParaExportacao {
  id: string;
  produto_id: string;
  tipo_movimentacao: TipoMovimentacaoEstoque;
  quantidade: number;
  referencia_documento: string | null;
  created_at: string;
  produtos_armazenados?: { sku: string; depositante_id: string } | null;
}

/**
 * Módulo 7 (Integração ERP) — molda um frete + seu saldo já calculado
 * (Módulo 3, `FretesService.computeSaldo`) no formato de exportação
 * financeira do ERP. Função pura (sem I/O), testável isoladamente do
 * Supabase.
 */
export function mapFreteParaErp(
  frete: Frete,
  saldo: SaldoFrete,
  numeroCrt: string | null,
): ErpFinanceiroRecord {
  return {
    frete_id: frete.id,
    viagem_id: frete.viagem_id,
    numero_crt: numeroCrt,
    numero_fatura: frete.numero_fatura ?? null,
    status_fechamento: frete.status_fechamento,
    valor_contratado: frete.valor_contratado,
    total_adiantamentos: saldo.total_adiantamentos,
    total_descontos: saldo.total_descontos,
    total_multas: saldo.total_multas,
    total_pago_confirmado: saldo.total_pago_confirmado,
    saldo: saldo.saldo,
    data_referencia: frete.created_at ?? new Date(0).toISOString(),
  };
}

/**
 * Módulo 7 — molda uma linha do ledger imutável de estoque (Módulo 5, já
 * com o produto "joinado" para obter SKU/depositante) no formato de
 * exportação de inventário do ERP. Função pura, testável isoladamente.
 */
export function mapMovimentacaoParaErp(row: MovimentacaoRowParaExportacao): ErpEstoqueRecord {
  return {
    movimentacao_id: row.id,
    produto_id: row.produto_id,
    sku: row.produtos_armazenados?.sku ?? null,
    depositante_id: row.produtos_armazenados?.depositante_id ?? null,
    tipo_movimentacao: row.tipo_movimentacao,
    quantidade: row.quantidade,
    referencia_documento: row.referencia_documento ?? null,
    data_movimentacao: row.created_at,
  };
}

/**
 * Verifica se um timestamp ISO cai dentro do período `[inicio, fim]`
 * (datas `YYYY-MM-DD`, inclusive nos dois extremos), comparando apenas a
 * parte de data. Usada como defesa em profundidade além do filtro `gte`/`lte`
 * já aplicado na query SQL — função pura, testável sem banco.
 */
export function estaNoPeriodo(dataIso: string, inicio: string, fim: string): boolean {
  const data = dataIso.slice(0, 10);
  return data >= inicio && data <= fim;
}
