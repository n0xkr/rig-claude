import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Fuel, Network, BarChart3 } from 'lucide-react';
import type { FrotaKpiVeiculo } from '@rigabras/shared';
import { useFrotaKpis } from '../hooks/useFrotaKpis.js';
import { useViagensList } from '../hooks/useViagens.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';
import { GlassCard, accentChip, type GlassAccent } from '../components/ui/GlassCard.js';
import { AnimatedCounter, CircularProgress } from '../components/ui/Telemetry.js';
import { GRUPO_STATUS_LABEL, grupoDoStatus, type GrupoStatus } from '../lib/viagemGrupos.js';

// Three.js/R3F só é baixado quando o painel abre (lazy loading da cena 3D).
const Dashboard3DBarChart = lazy(() =>
  import('../components/Dashboard3DBarChart.js').then((m) => ({ default: m.Dashboard3DBarChart })),
);
const FleetNodeChart3D = lazy(() => import('../components/3d/FleetNodeChart3D.js'));

const GRUPOS = Object.keys(GRUPO_STATUS_LABEL) as GrupoStatus[];
const TOP_N = 10;

type Metrica = 'km_rodado_total' | 'km_vazio_total' | 'qtd_viagens' | 'custo_km' | 'consumo';

const METRICAS: Record<
  Metrica,
  { label: string; unit: string; valor: (v: FrotaKpiVeiculo) => number | null; dec?: number }
> = {
  km_rodado_total: { label: 'Km rodado', unit: 'km', valor: (v) => v.km_rodado_total },
  km_vazio_total: { label: 'Km vazio', unit: 'km', valor: (v) => v.km_vazio_total },
  qtd_viagens: { label: 'Nº de viagens', unit: '', valor: (v) => v.qtd_viagens },
  custo_km: { label: 'Custo por km', unit: 'R$/km', valor: (v) => v.custo_km, dec: 2 },
  consumo: { label: 'Consumo', unit: 'km/l', valor: (v) => v.consumo_medio_km_litro, dec: 1 },
};

const fmt = (value: number, dec = 0, unit = '') =>
  `${value.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${
    unit ? ` ${unit}` : ''
  }`;

/** `YYYY-MM-DD` da data/hora ISO (comparação de período por dia, sem fuso). */
const dia = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');

/**
 * Painel de Operações: viewport 3D com a malha logística (viagens reais),
 * telemetria animada da frota e gráfico 3D por veículo — tudo com dados
 * reais dos hooks de KPI/viagens, nunca mock. Os filtros de período, status e
 * país valem para a malha 3D e para o contador de viagens; período e tipo de
 * frota também filtram os KPIs.
 */
export default function DashboardPage() {
  const navigate = useNavigate();

  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [grupos, setGrupos] = useState<Set<GrupoStatus>>(() => new Set(GRUPOS));
  const [pais, setPais] = useState('');
  const [metrica, setMetrica] = useState<Metrica>('km_rodado_total');
  const [frota, setFrota] = useState<'' | 'propria' | 'terceiros'>('');

  const { state, kpis, error, reload } = useFrotaKpis({
    periodStart: periodStart || undefined,
    periodEnd: periodEnd || undefined,
  });
  const { state: viagensState, viagens, truncated } = useViagensList();

  const paises = useMemo(
    () =>
      [
        ...new Set(
          viagens.map((v) => v.pais_destino).filter((p): p is NonNullable<typeof p> => !!p),
        ),
      ].sort(),
    [viagens],
  );

  const viagensFiltradas = useMemo(
    () =>
      viagens.filter((v) => {
        const g = grupoDoStatus(v.status);
        if (g && !grupos.has(g)) return false;
        if (pais && v.pais_destino !== pais) return false;
        const d = dia(v.data_programacao);
        if (periodStart && d && d < periodStart) return false;
        if (periodEnd && d && d > periodEnd) return false;
        return true;
      }),
    [viagens, grupos, pais, periodStart, periodEnd],
  );

  const emAndamento = useMemo(
    () =>
      viagensFiltradas.filter((v) => {
        const g = grupoDoStatus(v.status);
        return g === 'EM_ROTA' || g === 'FRONTEIRA';
      }).length,
    [viagensFiltradas],
  );

  const m = METRICAS[metrica];
  const barras = useMemo(() => {
    if (!kpis) return [];
    return kpis.por_veiculo
      .filter((v) =>
        frota === '' ? true : frota === 'propria' ? v.frota_propria : !v.frota_propria,
      )
      .map((v) => ({ label: v.placa, value: m.valor(v) }))
      .filter((b): b is { label: string; value: number } => b.value !== null)
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_N);
  }, [kpis, frota, m]);

  const filtrosAtivos =
    periodStart !== '' || periodEnd !== '' || pais !== '' || grupos.size !== GRUPOS.length;
  const limparFiltros = () => {
    setPeriodStart('');
    setPeriodEnd('');
    setPais('');
    setGrupos(new Set(GRUPOS));
  };
  const alternarGrupo = (g: GrupoStatus) =>
    setGrupos((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  const inputCls = 'rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800';

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Painel de Operações</h1>
        <p className="text-sm text-slate-500">
          Visão geral da frota, viagens e desempenho — Rigabras TMS + WMS.
        </p>
      </div>

      <GlassCard accent="cyan" tilt={0} className="mb-6 p-4 sm:p-5">
        <form
          className="flex flex-wrap items-end gap-x-4 gap-y-3"
          onSubmit={(e) => e.preventDefault()}
          aria-label="Filtros do painel"
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Programadas a partir de
            <input
              type="date"
              className={inputCls}
              value={periodStart}
              max={periodEnd || undefined}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            até
            <input
              type="date"
              className={inputCls}
              value={periodEnd}
              min={periodStart || undefined}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            País de destino
            <select className={inputCls} value={pais} onChange={(e) => setPais(e.target.value)}>
              <option value="">Todos</option>
              {paises.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs font-medium text-slate-600">Situação da viagem</legend>
            <div className="flex flex-wrap gap-2">
              {GRUPOS.map((g) => (
                <label
                  key={g}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors focus-within:ring-2 focus-within:ring-blue-400 ${
                    grupos.has(g)
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={grupos.has(g)}
                    onChange={() => alternarGrupo(g)}
                  />
                  {GRUPO_STATUS_LABEL[g]}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            onClick={limparFiltros}
            disabled={!filtrosAtivos}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Limpar filtros
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-500" aria-live="polite">
          {viagensState === 'success'
            ? `Mostrando ${viagensFiltradas.length} de ${viagens.length} viagens${
                truncated ? ' (há viagens mais antigas além do limite carregado)' : ''
              }.`
            : 'Carregando viagens…'}
        </p>
      </GlassCard>

      <GlassCard accent="cyan" tilt={0} className="mb-6 p-4 sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Network className="h-5 w-5 text-blue-600" /> Malha logística 3D
          </h2>
          <span className="text-xs text-slate-500">
            Arraste para girar · role/pince para zoom · toque num nó para ver a telemetria
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
            <FleetNodeChart3D
              viagens={viagensFiltradas}
              onOpenViagem={(id) => navigate(`/viagens/${id}`)}
            />
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
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Indicadores">
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
                <p className="text-sm text-slate-500">Ocupação</p>
                <p className="mt-1 text-xs text-slate-500">da frota em viagem</p>
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
              label="Viagens em andamento"
              accent="cyan"
              value={viagensState === 'success' ? <AnimatedCounter value={emAndamento} /> : '—'}
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

          <GlassCard accent="emerald" tilt={0} className="p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <BarChart3 className="h-5 w-5 text-emerald-600" /> {m.label} por veículo (3D)
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className={inputCls}
                  value={metrica}
                  onChange={(e) => setMetrica(e.target.value as Metrica)}
                  aria-label="Métrica do gráfico de barras"
                >
                  {(Object.keys(METRICAS) as Metrica[]).map((k) => (
                    <option key={k} value={k}>
                      {METRICAS[k].label}
                    </option>
                  ))}
                </select>
                <select
                  className={inputCls}
                  value={frota}
                  onChange={(e) => setFrota(e.target.value as typeof frota)}
                  aria-label="Tipo de frota"
                >
                  <option value="">Toda a frota</option>
                  <option value="propria">Frota própria</option>
                  <option value="terceiros">Terceiros</option>
                </select>
              </div>
            </div>
            <Suspense fallback={<LoadingSkeleton rows={2} />}>
              <Dashboard3DBarChart
                data={barras.some((b) => b.value > 0) ? barras : []}
                ariaLabel={`${m.label} por veículo`}
                formatValue={(v) => fmt(v, m.dec ?? 0, m.unit)}
              />
            </Suspense>
            <p className="mt-2 text-xs text-slate-500">
              Top {TOP_N} por {m.label.toLowerCase()} · arraste para girar, role para zoom.
            </p>
            <ul className="mt-3 flex flex-wrap gap-3">
              {barras.map((b) => (
                <li
                  key={b.label}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600"
                >
                  {b.label} · {fmt(b.value, m.dec ?? 0, m.unit)}
                </li>
              ))}
            </ul>
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
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </GlassCard>
  );
}
