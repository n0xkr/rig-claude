import { Link } from 'react-router-dom';
import { PackageCheck, Plus } from 'lucide-react';
import { useRecebimentosList } from '../hooks/useRecebimentos.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';
import { RecebimentoStatusBadge } from '../components/StatusBadge.js';
import { WmsSubNav } from '../components/WmsSubNav.js';

/** Lista de recebimentos (Módulo 5, WMS — Recebimento e Conferência). */
export default function RecebimentosListPage() {
  const { state, recebimentos, error, reload } = useRecebimentosList();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <WmsSubNav />
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-6 w-6 text-rigabras-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Recebimentos</h1>
            <p className="text-sm text-slate-500">
              Entrada, conferência e endereçamento de mercadoria no armazém.
            </p>
          </div>
        </div>
        <Link
          to="/wms/recebimentos/novo"
          className="flex items-center gap-2 rounded-xl bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-all duration-200"
        >
          <Plus className="h-4 w-4" /> Novo recebimento
        </Link>
      </div>

      {state === 'loading' && <LoadingSkeleton />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro desconhecido'} onRetry={reload} />}
      {state === 'success' && recebimentos.length === 0 && (
        <EmptyState
          title="Nenhum recebimento registrado"
          description="Registre a expectativa de recebimento de um depositante."
        />
      )}
      {state === 'success' && recebimentos.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
          {recebimentos.map((r) => (
            <li key={r.id}>
              <Link
                to={`/wms/recebimentos/${r.id}`}
                className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-slate-50 transition-all duration-200"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {r.referencia_documento ?? r.id.slice(0, 8)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {r.data_prevista
                      ? `previsto para ${new Date(`${r.data_prevista}T00:00:00`).toLocaleDateString('pt-BR')}`
                      : 'sem data prevista'}
                  </p>
                </div>
                <RecebimentoStatusBadge status={r.status ?? 'AGUARDANDO'} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
