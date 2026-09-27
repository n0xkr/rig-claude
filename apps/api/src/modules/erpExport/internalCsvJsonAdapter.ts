import type { ErpEstoqueRecord, ErpFinanceiroRecord, Frete } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
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
  constructor(private readonly fretesService: FretesService = new FretesService()) {}

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
    const { data: viagensData, error: viagensError } = await supabaseAdmin
      .from('viagens')
      .select('id, numero_crt')
      .in('id', viagemIds);
    if (viagensError) throw viagensError;
    const crtPorViagem = new Map<string, string | null>(
      (viagensData ?? []).map((v: { id: string; numero_crt: string | null }) => [
        v.id,
        v.numero_crt,
      ]),
    );

    const registros: ErpFinanceiroRecord[] = [];
    for (const frete of fretes) {
      const saldo = await this.fretesService.computeSaldo(frete.id);
      registros.push(mapFreteParaErp(frete, saldo, crtPorViagem.get(frete.viagem_id) ?? null));
    }
    return registros;
  }

  private async listarFretesNoPeriodo(periodo: PeriodoExportacao): Promise<Frete[]> {
    const { data, error } = await supabaseAdmin
      .from('fretes')
      .select('*')
      .is('deleted_at', null)
      .gte('created_at', `${periodo.inicio}T00:00:00.000Z`)
      .lte('created_at', `${periodo.fim}T23:59:59.999Z`)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Frete[];
  }

  /**
   * Exportação de estoque (critério "inventory movements"): uma linha por
   * evento do ledger imutável `movimentacoes_estoque` (Módulo 5) criado
   * dentro do período, com SKU/depositante obtidos via join em
   * `produtos_armazenados`.
   */
  async exportEstoque(periodo: PeriodoExportacao): Promise<ErpEstoqueRecord[]> {
    const { data, error } = await supabaseAdmin
      .from('movimentacoes_estoque')
      .select(
        'id, produto_id, tipo_movimentacao, quantidade, referencia_documento, created_at, produtos_armazenados(sku, depositante_id)',
      )
      .gte('created_at', `${periodo.inicio}T00:00:00.000Z`)
      .lte('created_at', `${periodo.fim}T23:59:59.999Z`)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as MovimentacaoRowParaExportacao[]).map(mapMovimentacaoParaErp);
  }
}
