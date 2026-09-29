import { lazy, Suspense, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Fuel, Wrench, Network } from 'lucide-react';
import { useFrotaKpis } from '../hooks/useFrotaKpis.js';
import { useViagensList } from '../hooks/useViagens.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';
import { GlassCard, accentChip, type GlassAccent } from '../components/ui/GlassCard.js';
import { AnimatedCounter, CircularProgress } from '../components/ui/Telemetry.js';

// Three.js/R3F só é baixado quando o painel abre (lazy loading da cena 3D).
const Dashboard3DBarChart = lazy(() =>
  import('../components/Dashboard3DBarChart.js').then((m) => ({ default: m.Dashboard3DBarChart })),
);
const FleetNodeChart3D = lazy(() => import('../components/3d/FleetNodeChart3D.js'));

/**
 * Painel de Operações: viewport 3D com a malha logística (viagens reais),
 * telemetria animada da frota e gráfico 3D de km por veículo — tudo com dados
 * reais dos hooks de KPI/viagens, nunca mock.
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { state, kpis, error, reload } = useFrotaKpis({});
  const { state: viagensState, viagens } = useViagensList();

  const emTransito = viagens.filter((v) =>
    ['EM_TRANSITO', 'NA_FRONTEIRA', 'EM_MONITORAMENTO'].includes(v.status),
  ).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Painel de Operações</h1>
        <p className="text-sm text-slate-500">
          Visão geral da frota, viagens e desempenho — Rigabras TMS + WMS.
        </p>
      </div>

      <GlassCard accent="cyan" tilt={0} className="mb-6 p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Network className="h-5 w-5 text-blue-600" /> Malha logística 3D
          </h2>
          <span className="hidden text-xs text-slate-500 sm:inline">
            Arraste para girar · toque num nó para ver a telemetria
          </span>
        </div>
        {viagensState === 'loading' || viagensState === 'idle' ? (
          <LoadingSkeleton rows={3} />
        ) : viagensState === 'error' ? (
          <p className="py-10 text-center text-sm text-slate-500">
            Não foi possível carregar as viagens.
          </p>
        ) : (
          <Suspense fallback={<LoadingSkeleton rows={3} />}>
            <FleetNodeChart3D viagens={viagens} onOpenViagem={(id) => navigate(`/viagens/${id}`)} />
          </Suspense>
        )}
      </GlassCard>

      {state === 'loading' || state === 'idle' ? (
        <LoadingSkeleton rows={4} />
      ) : state === 'error' ? (
        <ErrorCard message={error ?? 'Erro'} onRetry={reload} />
      ) : !kpis ? (
        <EmptyState title="Sem dados" description="Nenhum indicador disponível." />
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile
              icon={<Truck className="h-5 w-5" />}
              label="Frota ativa"
              accent="emerald"
              value={<AnimatedCounter value={kpis.frota_total} />}
            />
            <GlassCard
              accent="amber"
              haptic="tap"
              className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between"
            >
              <div>
                <dt className="text-sm text-slate-500">Ocupação</dt>
                <dd className="mt-1 text-xs text-slate-500">da frota em viagem</dd>
              </div>
              <CircularProgress
                percent={kpis.percentual_ocupacao}
                size={72}
                color="#f59e0b"
                label="Ocupação"
              />
            </GlassCard>
            <StatTile
              icon={<Truck className="h-5 w-5" />}
              label="Em trânsito agora"
              accent="cyan"
              value={viagensState === 'success' ? <AnimatedCounter value={emTransito} /> : '—'}
            />
            <StatTile
              icon={<Fuel className="h-5 w-5" />}
              label="Consumo médio"
              accent="emerald"
              value={
                kpis.consumo_medio_km_litro != null ? (
                  <AnimatedCounter
                    value={kpis.consumo_medio_km_litro}
                    decimals={1}
                    suffix=" km/l"
                  />
                ) : (
                  '-'
                )
              }
            />
          </section>

          <GlassCard accent="emerald" tilt={0} className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Wrench className="h-5 w-5 text-emerald-600" /> Km rodado por veículo (3D)
              </h2>
              <span className="text-xs text-slate-500">Arraste o olhar — rotação automática</span>
            </div>
            <Suspense fallback={<LoadingSkeleton rows={2} />}>
              <Dashboard3DBarChart
                data={kpis.por_veiculo.map((v) => ({ label: v.placa, value: v.km_rodado_total }))}
              />
            </Suspense>
            <div className="mt-4 flex flex-wrap gap-3">
              {kpis.por_veiculo.map((v) => (
                <span
                  key={v.veiculo_id}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600"
                >
                  {v.placa} · {v.km_rodado_total.toLocaleString('pt-BR')} km
                </span>
              ))}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  accent: GlassAccent;
}) {
  return (
    <GlassCard accent={accent} haptic="tap" className="p-6">
      <div
        className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${accentChip(accent)}`}
      >
        {icon}
      </div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-bold text-slate-900">{value}</dd>
    </GlassCard>
  );
}
