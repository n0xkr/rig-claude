import { Link } from 'react-router-dom';
import { Plus, Truck } from 'lucide-react';
import { usePortariaEntradasList, usePortariaKpis } from '../hooks/usePortaria.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';
import { PortariaEntradaStatusBadge } from '../components/StatusBadge.js';

/** Lista de entradas na portaria (Módulo 8): pátio atual, aguardando conferência/descarga. */
export default function PortariaEntradasListPage() {
  const { state, entradas, error, reload } = usePortariaEntradasList();
  const { kpis } = usePortariaKpis();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-white">Portaria</h1>
        <Link
          to="/portaria/nova"
          className="flex items-center gap-2 rounded-md bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
        >
          <Plus className="h-4 w-4" /> Nova entrada
        </Link>
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
          actionLabel="Nova entrada"
          onAction={() => {
            window.location.href = '/portaria/nova';
          }}
        />
      ) : (
        <div className="space-y-3">
          {entradas.map((entrada) => (
            <Link
              key={entrada.id}
              to={`/portaria/${entrada.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 p-4 hover:bg-slate-900/60"
            >
              <div className="flex items-center gap-3">
                <Truck className="h-5 w-5 text-rigabras-500" />
                <div>
                  <p className="font-medium text-slate-100">
                    {entrada.placa_cavalo}
                    {entrada.placa_carreta ? ` / ${entrada.placa_carreta}` : ''}
                  </p>
                  <p className="text-sm text-slate-400">
                    {entrada.motorista_nome} · {new Date(entrada.data_entrada ?? '').toLocaleString('pt-BR')}
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
    <div className="rounded-lg border border-slate-800 p-3">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}
