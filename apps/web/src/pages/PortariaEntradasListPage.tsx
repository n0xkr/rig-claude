import { Link } from 'react-router-dom';
import { Plus, Truck } from 'lucide-react';
import { getCurrentUserRole } from '../lib/apiClient.js';
import { usePortariaEntradasList, usePortariaKpis } from '../hooks/usePortaria.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';
import { PortariaEntradaStatusBadge } from '../components/StatusBadge.js';

/** Lista de entradas na portaria (Módulo 8): pátio atual, aguardando conferência/descarga. */
export default function PortariaEntradasListPage() {
  const { state, entradas, error, reload } = usePortariaEntradasList();
  const { kpis } = usePortariaKpis();
  // Gating de UX (a API já barra VISITANTE no POST /portaria/entradas).
  const role = getCurrentUserRole();
  const podeRegistrar =
    role === 'SUPERADMIN' || role === 'ADMIN' || role === 'OPERADOR' || role === 'PORTARIA';

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900">Portaria</h1>
        {podeRegistrar && (
          <Link
            to="/portaria/nova"
            className="flex items-center gap-2 rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-all duration-200"
          >
            <Plus className="h-4 w-4" /> Nova entrada
          </Link>
        )}
      </div>

      {kpis && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Aguardando conferência" value={kpis.aguardandoConferencia} />
          <KpiCard label="Liberados no pátio" value={kpis.liberadosNoPatio} />
          <KpiCard label="Aguardando saída" value={kpis.aguardandoSaida} />
          <KpiCard label="Permanência média (min)" value={kpis.tempoMedioPatioMinutos} />
        </div>
      )}

      {state === 'loading' || state === 'idle' ? (
        <LoadingSkeleton />
      ) : state === 'error' ? (
        <ErrorCard message={error ?? 'Erro'} onRetry={reload} />
      ) : entradas.length === 0 ? (
        <EmptyState
          title="Nenhuma entrada registrada"
          description="Registre a chegada de um veículo na portaria para começar."
          actionLabel={podeRegistrar ? 'Nova entrada' : undefined}
          onAction={
            podeRegistrar
              ? () => {
                  window.location.href = '/portaria/nova';
                }
              : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {entradas.map((entrada) => (
            <Link
              key={entrada.id}
              to={`/portaria/${entrada.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 hover:bg-slate-50 transition-all duration-200 bg-white shadow-sm"
            >
              <div className="flex items-center gap-3">
                <Truck className="h-5 w-5 text-rigabras-500" />
                <div>
                  <p className="font-medium text-slate-900">
                    {entrada.placa_cavalo}
                    {entrada.placa_carreta ? ` / ${entrada.placa_carreta}` : ''}
                  </p>
                  <p className="text-sm text-slate-500">
                    {entrada.motorista_nome} ·{' '}
                    {new Date(entrada.data_entrada ?? '').toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
              <PortariaEntradaStatusBadge status={entrada.status ?? 'AGUARDANDO_CONFERENCIA'} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 bg-white shadow-sm">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
