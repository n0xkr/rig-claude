import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Truck } from 'lucide-react';
import { useViagensList } from '../hooks/useViagens.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';
import { StatusBadge } from '../components/StatusBadge.js';

export default function ViagensListPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { state, viagens, error, reload } = useViagensList(statusFilter || undefined);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Viagens</h1>
          <p className="text-sm text-slate-500">Gerenciamento de Risco — Rigabras Transportes</p>
        </div>
        <Link
          to="/viagens/nova"
          className="inline-flex items-center gap-2 rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-all duration-200"
        >
          <Plus className="h-4 w-4" /> Nova viagem
        </Link>
      </div>

      <div className="mb-4 flex gap-2">
        {[
          '',
          'PROGRAMADA',
          'EM_COLETA',
          'EM_TRANSITO',
          'NA_FRONTEIRA',
          'ENTREGUE',
          'ENCERRADA',
        ].map((s) => (
          <button
            key={s || 'TODAS'}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              statusFilter === s ? 'bg-rigabras-500 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {s ? s.replaceAll('_', ' ') : 'Todas'}
          </button>
        ))}
      </div>

      {state === 'loading' && <LoadingSkeleton />}

      {state === 'error' && <ErrorCard message={error ?? 'Erro desconhecido'} onRetry={reload} />}

      {state === 'success' && viagens.length === 0 && (
        <EmptyState
          title="Nenhuma viagem cadastrada"
          description="Comece programando a primeira viagem para acompanhar coleta, fronteira e entrega."
          actionLabel="Criar primeira viagem"
          onAction={() => (window.location.href = '/viagens/nova')}
        />
      )}

      {state === 'success' && viagens.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
          {viagens.map((v) => (
            <li key={v.id}>
              <Link
                to={`/viagens/${v.id}`}
                className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-slate-50 transition-all duration-200"
              >
                <div className="flex items-center gap-3">
                  <Truck className="h-5 w-5 text-slate-500" />
                  <div>
                    <p className="font-medium text-slate-900">
                      {v.numero_crt ?? 'CRT pendente'} — {v.placa_cavalo}
                    </p>
                    <p className="text-sm text-slate-500">
                      {v.origem} → {v.destino} {v.pais_destino ? `(${v.pais_destino})` : ''}
                    </p>
                  </div>
                </div>
                <StatusBadge status={v.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
