import type { ErpEstoqueRecord, ErpFinanceiroRecord } from '@rigabras/shared';

/** Período (inclusive) de uma exportação ERP, em datas `YYYY-MM-DD`. */
export interface PeriodoExportacao {
  inicio: string;
  fim: string;
}

/**
 * Módulo 7 (Integração ERP) — contrato único que qualquer ERP (interno ou de
 * terceiros) deve implementar para receber os dados financeiros (Módulo 3 —
 * contas a pagar/receber do frete) e de estoque (Módulo 5 — movimentações do
 * ledger) da Rigabras.
 *
 * A camada que consome exportações (`ErpExportService`, e por consequência
 * as rotas HTTP) depende SOMENTE desta interface, nunca de
 * `InternalCsvJsonAdapter` diretamente. Plugar um adapter real de ERP (ex:
 * SAP, TOTVS, Sankhya — citados apenas como exemplos comuns na logística
 * brasileira; NENHUM implementado aqui) é uma questão de criar uma nova
 * classe que implemente `ErpAdapter` (chamando a API real daquele ERP em vez
 * de ler do Supabase) e trocar a instância injetada no construtor de
 * `ErpExportService` — nenhuma rota, controller ou service que consome a
 * exportação precisa mudar.
 */
export interface ErpAdapter {
  exportFinanceiro(periodo: PeriodoExportacao): Promise<ErpFinanceiroRecord[]>;
  exportEstoque(periodo: PeriodoExportacao): Promise<ErpEstoqueRecord[]>;
}
