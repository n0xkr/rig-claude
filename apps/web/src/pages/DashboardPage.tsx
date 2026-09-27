import type { ReactNode } from 'react';
import { LayoutDashboard, Truck, Gauge, Fuel, Wrench } from 'lucide-react';
import { useFrotaKpis } from '../hooks/useFrotaKpis.js';
import { useViagensList } from '../hooks/useViagens.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';
import { Dashboard3DBarChart } from '../components/Dashboard3DBarChart.js';

/**
 * Painel de apresentação das operações: visão geral da frota e viagens em
 * andamento, com um gráfico 3D (Three.js) plotando km rodado por veículo —
 * dado real vindo de `useFrotaKpis().por_veiculo` (mesmo dado já usado em
 * `FrotaKpiPage`), nunca mock.
 */
export default function DashboardPage() {
  const { state, kpis, error, reload } = useFrotaKpis({});
  const { state: viagensState, viagens } = useViagensList();

  const emTransito = viagens.filter((v) =>
    ['EM_TRANSITO', 'NA_FRONTEIRA', 'EM_MONITORAMENTO'].includes(v.status),
  ).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex items-center gap-3">
        <span className="rounded-xl bg-brand-gradient p-2 shadow-glow-green">
          <LayoutDashboard className="h-6 w-6 text-slate-950" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-white">Painel de Operações</h1>
          <p className="text-sm text-slate-400">
            Visão geral da frota, viagens e desempenho — Rigabras TMS + WMS.
          </p>
        </div>
      </div>

      {state === 'loading' || state === 'idle' ? (
        <LoadingSkeleton rows={4} />
      ) : state === 'error' ? (
        <ErrorCard message={error ?? 'Erro'} onRetry={reload} />
      ) : !kpis ? (
        <EmptyState title="Sem dados" description="Nenhum indicador disponível." />
      ) : (
        <div className="space-y-8">
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile
              icon={<Truck className="h-5 w-5" />}
              label="Frota ativa"
              value={kpis.frota_total}
              glow="shadow-glow-green"
            />
            <StatTile
              icon={<Gauge className="h-5 w-5" />}
              label="Ocupação"
              value={`${kpis.percentual_ocupacao}%`}
              glow="shadow-glow-yellow"
            />
            <StatTile
              icon={<Truck className="h-5 w-5" />}
              label="Em trânsito agora"
              value={viagensState === 'success' ? emTransito : '—'}
              glow="shadow-glow-blue"
            />
            <StatTile
              icon={<Fuel className="h-5 w-5" />}
              label="Consumo médio"
              value={
                kpis.consumo_medio_km_litro != null ? `${kpis.consumo_medio_km_litro} km/l` : '-'
              }
              glow="shadow-glow-green"
            />
          </section>

          <section className="card-glass p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                <Wrench className="h-5 w-5 text-brand-green" /> Km rodado por veículo (3D)
              </h2>
              <span className="text-xs text-slate-500">Arraste o olhar — rotação automática</span>
            </div>
            <Dashboard3DBarChart
              data={kpis.por_veiculo.map((v) => ({ label: v.placa, value: v.km_rodado_total }))}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              {kpis.por_veiculo.map((v) => (
                <span
                  key={v.veiculo_id}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300"
                >
                  {v.placa} · {v.km_rodado_total.toLocaleString('pt-BR')} km
                </span>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  glow,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  glow: string;
}) {
  return (
    <div className={`card-glass group p-4 transition-transform duration-300 hover:-translate-y-1 ${glow}`}>
      <div className="mb-2 flex items-center gap-2 text-brand-green">{icon}</div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-slate-100">{value}</dd>
    </div>
  );
}
