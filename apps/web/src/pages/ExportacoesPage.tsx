import { useState } from 'react';
import type { ErpEstoqueRecord, ErpFinanceiroRecord } from '@rigabras/shared';
import { Download, FileJson, ShieldAlert } from 'lucide-react';
import { useErpExport, type ErpExportTipo } from '../hooks/useErpExport.js';
import { getCurrentUserRole } from '../lib/apiClient.js';
import { EmptyState } from '../components/StateViews.js';

function primeiroDiaDoMes(): string {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Módulo 7 (Integração ERP) — tela "Exportações": permite a um usuário
 * ADMIN/SUPERADMIN escolher um período e um tipo de exportação (dados
 * financeiros do frete — Módulo 3 — ou movimentações de estoque — Módulo 5)
 * e visualizar em JSON ou baixar como CSV. RBAC real é reforçado pelo
 * backend (403 se o papel não permitir); a UI apenas esconde a tela para
 * papéis que sabidamente não terão acesso, como conveniência de UX.
 */
export default function ExportacoesPage() {
  const role = getCurrentUserRole();
  const [tipo, setTipo] = useState<ErpExportTipo>('financeiro');
  const [inicio, setInicio] = useState(primeiroDiaDoMes());
  const [fim, setFim] = useState(hoje());
  const [registros, setRegistros] = useState<Array<ErpFinanceiroRecord | ErpEstoqueRecord> | null>(
    null,
  );
  const { visualizar, baixarCsv, loading, error } = useErpExport();

  if (role && role !== 'ADMIN' && role !== 'SUPERADMIN') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <EmptyState
          title="Acesso restrito"
          description="A exportação de dados financeiros e de estoque para o ERP (Módulo 7) é restrita aos papéis ADMIN e SUPERADMIN."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Exportações (Integração ERP)</h1>
        <p className="text-sm text-slate-400">
          Módulo 7 — exporta dados financeiros (frete contratado, lançamentos e pagamentos) e de
          estoque (ledger de movimentações do armazém) no formato que um ERP (SAP, TOTVS, Sankhya
          etc. — apenas exemplos) consumiria.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-800 p-4">
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Tipo
          <select
            className="input"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as ErpExportTipo);
              setRegistros(null);
            }}
          >
            <option value="financeiro">Financeiro (fretes)</option>
            <option value="estoque">Estoque (movimentações)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Início
          <input
            type="date"
            className="input"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Fim
          <input
            type="date"
            className="input"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
          />
        </label>
        <button
          disabled={loading}
          onClick={async () => {
            const data = await visualizar(tipo, { inicio, fim }).catch(() => null);
            setRegistros(data);
          }}
          className="inline-flex items-center gap-2 rounded-md bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          <FileJson className="h-4 w-4" /> Visualizar (JSON)
        </button>
        <button
          disabled={loading}
          onClick={() => baixarCsv(tipo, { inicio, fim })}
          className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900/60 disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Baixar CSV
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">
          <ShieldAlert className="h-4 w-4" /> {error}
        </div>
      )}

      {registros === null ? (
        <EmptyState
          title="Nenhum dado carregado ainda"
          description="Escolha um período e clique em 'Visualizar (JSON)' para inspecionar os registros, ou em 'Baixar CSV' para exportar direto."
        />
      ) : registros.length === 0 ? (
        <EmptyState
          title="Nenhum registro no período"
          description="Não há fretes/movimentações de estoque criados dentro do período selecionado."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-slate-400">
              <tr>
                {Object.keys(registros[0]!).map((coluna) => (
                  <th key={coluna} className="px-3 py-2 font-medium">
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {registros.map((registro, index) => (
                <tr key={index} className="border-t border-slate-800 text-slate-200">
                  {Object.values(registro).map((valor, i) => (
                    <td key={i} className="px-3 py-2">
                      {String(valor ?? '-')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
