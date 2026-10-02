import type {
  ErpEstoqueRecord,
  ErpFinanceiroRecord,
  Frete,
  FreteLancamento,
  PagamentoFrete,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { fetchAllPages, periodoFimTs, periodoInicioTs } from '../../lib/fetchAllPages.js';
import { FretesService } from '../fretes/fretes.service.js';
import type { ErpAdapter, PeriodoExportacao } from './erpAdapter.js';
import { mapFreteParaErp, mapMovimentacaoParaErp } from './erpExport.mapper.js';
import type { MovimentacaoRowParaExportacao } from './erpExport.mapper.js';

/**
 * Módulo 7 (Integração ERP) — ÚNICA implementação concreta de `ErpAdapter`
 * hoje: lê os dados diretamente do Supabase (fonte da verdade interna) e os
 * serializa nos tipos documentados de exportação (CSV/JSON são aplicados
 * pela camada de rota, a partir destes registros tipados — ver
 * `erpExport.controller.ts`). Um adapter de ERP real (SAP, TOTVS, Sankhya,
 * etc. — apenas exemplos) substituiria esta classe por uma que chama a API
 * daquele ERP, implementando a mesma interface `ErpAdapter` — nenhum código
 * chamador precisaria mudar.
 */
export class InternalCsvJsonAdapter implements ErpAdapter {
  /**
   * Exportação financeira (critério "accounts payable/receivable"): um
   * registro por frete contratado (Módulo 3) criado dentro do período, com
   * o saldo recalculado a partir de `frete_lancamentos`/`pagamentos_frete`
   * (nunca de uma coluna persistida) — reaproveita
   * `FretesService.computeSaldo`, a mesma lógica usada pela tela de saldo do
   * frete, para nunca haver dois cálculos de saldo divergentes no sistema.
   */
  async exportFinanceiro(periodo: PeriodoExportacao): Promise<ErpFinanceiroRecord[]> {
    const fretes = await this.listarFretesNoPeriodo(periodo);
    if (fretes.length === 0) return [];

    const viagemIds = [...new Set(fretes.map((f) => f.viagem_id))];
    const freteIds = fretes.map((f) => f.id);
    const crtPorViagem = new Map<string, string | null>();
    const lancPorFrete = new Map<string, FreteLancamento[]>();
    const pagPorFrete = new Map<string, PagamentoFrete[]>();
    const LOTE = 100;
    for (let i = 0; i < viagemIds.length; i += LOTE) {
      const { data, error } = await supabaseAdmin
        .from('viagens')
        .select('id, numero_crt')
        .in('id', viagemIds.slice(i, i + LOTE));
      if (error) throw error;
      for (const v of (data ?? []) as { id: string; numero_crt: string | null }[]) {
        crtPorViagem.set(v.id, v.numero_crt);
      }
    }
    for (let i = 0; i < freteIds.length; i += LOTE) {
      const ids = freteIds.slice(i, i + LOTE);
      const [lancs, pags] = await Promise.all([
        supabaseAdmin.from('frete_lancamentos').select('*').in('frete_id', ids).is('deleted_at', null),
        supabaseAdmin.from('pagamentos_frete').select('*').in('frete_id', ids).is('deleted_at', null),
      ]);
      if (lancs.error) throw lancs.error;
      if (pags.error) throw pags.error;
      for (const l of (lancs.data ?? []) as FreteLancamento[]) {
        lancPorFrete.set(l.frete_id, [...(lancPorFrete.get(l.frete_id) ?? []), l]);
      }
      for (const p of (pags.data ?? []) as PagamentoFrete[]) {
        pagPorFrete.set(p.frete_id, [...(pagPorFrete.get(p.frete_id) ?? []), p]);
      }
    }

    return fretes.map((frete) =>
      mapFreteParaErp(
        frete,
        FretesService.saldoDeRegistros(
          frete,
          lancPorFrete.get(frete.id) ?? [],
          pagPorFrete.get(frete.id) ?? [],
        ),
        crtPorViagem.get(frete.viagem_id) ?? null,
      ),
    );
  }

  private async listarFretesNoPeriodo(periodo: PeriodoExportacao): Promise<Frete[]> {
    return fetchAllPages<Frete>((from, to) =>
      supabaseAdmin
        .from('fretes')
        .select('*')
        .is('deleted_at', null)
        .gte('created_at', periodoInicioTs(periodo.inicio))
        .lte('created_at', periodoFimTs(periodo.fim))
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    );
  }

  /**
   * Exportação de estoque (critério "inventory movements"): uma linha por
   * evento do ledger imutável `movimentacoes_estoque` (Módulo 5) criado
   * dentro do período, com SKU/depositante obtidos via join em
   * `produtos_armazenados`.
   */
  async exportEstoque(periodo: PeriodoExportacao): Promise<ErpEstoqueRecord[]> {
    const data = await fetchAllPages<unknown>((from, to) =>
      supabaseAdmin
        .from('movimentacoes_estoque')
        .select(
          'id, produto_id, tipo_movimentacao, quantidade, referencia_documento, created_at, produtos_armazenados(sku, depositante_id)',
        )
        .gte('created_at', periodoInicioTs(periodo.inicio))
        .lte('created_at', periodoFimTs(periodo.fim))
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    );
    return (data as MovimentacaoRowParaExportacao[]).map(mapMovimentacaoParaErp);
  }
}
