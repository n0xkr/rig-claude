import type { ErpEstoqueRecord, ErpFinanceiroRecord } from '@rigabras/shared';
import type { ErpAdapter, PeriodoExportacao } from './erpAdapter.js';
import { InternalCsvJsonAdapter } from './internalCsvJsonAdapter.js';

/**
 * Módulo 7 (Integração ERP) — orquestra a exportação chamando o `ErpAdapter`
 * injetado (hoje `InternalCsvJsonAdapter`, amanhã um adapter de ERP real).
 * Este service depende apenas da interface `ErpAdapter`, nunca da
 * implementação concreta: é o ponto de extensão documentado — trocar o
 * adapter passado ao construtor é a única mudança necessária para plugar um
 * ERP de terceiros, sem tocar em nenhuma rota/controller.
 */
export class ErpExportService {
  constructor(private readonly adapter: ErpAdapter = new InternalCsvJsonAdapter()) {}

  exportarFinanceiro(periodo: PeriodoExportacao): Promise<ErpFinanceiroRecord[]> {
    return this.adapter.exportFinanceiro(periodo);
  }

  exportarEstoque(periodo: PeriodoExportacao): Promise<ErpEstoqueRecord[]> {
    return this.adapter.exportEstoque(periodo);
  }
}
