import { Link } from 'react-router-dom';
import { Truck, Plus } from 'lucide-react';
import { useExpedicoesList } from '../hooks/useExpedicoes.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';
import { ExpedicaoStatusBadge } from '../components/StatusBadge.js';
import { WmsSubNav } from '../components/WmsSubNav.js';

/** Lista de expedições (Módulo 5, WMS — Separação/Reembalagem/Etiquetagem/Cross-docking/Expedição). */
export default function ExpedicoesListPage() {
  const { state, expedicoes, error, reload } = useExpedicoesList();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <WmsSubNav />
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Truck className="h-6 w-6 text-rigabras-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Expedições</h1>
            <p className="text-sm text-slate-500">
              Separação, reembalagem, etiquetagem, cross-docking e expedição.
            </p>
          </div>
        </div>
        <Link
          to="/wms/expedicoes/nova"
          className="flex items-center gap-2 rounded-xl bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-all duration-200"
        >
          <Plus className="h-4 w-4" /> Nova expedição
        </Link>
      </div>

      {state === 'loading' && <LoadingSkeleton />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro desconhecido'} onRetry={reload} />}
      {state === 'success' && expedicoes.length === 0 && (
        <EmptyState
          title="Nenhuma expedição registrada"
          description="Registre a solicitação de saída de mercadoria de um depositante."
        />
      )}
      {state === 'success' && expedicoes.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
          {expedicoes.map((exp) => (
            <li key={exp.id}>
              <Link
                to={`/wms/expedicoes/${exp.id}`}
                className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-slate-50 transition-all duration-200"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {exp.referencia_documento ?? exp.id.slice(0, 8)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {exp.tipo === 'CROSS_DOCKING' ? 'Cross-docking' : 'Normal'}
                  </p>
                </div>
                <ExpedicaoStatusBadge status={exp.status ?? 'SOLICITADA'} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
