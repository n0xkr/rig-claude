import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Warehouse, PackageCheck, Truck, AlertOctagon, ClipboardList, Boxes } from 'lucide-react';
import { useWmsKpis } from '../hooks/useWmsKpis.js';
import { useArmazensList } from '../hooks/useEnderecosArmazem.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';

/** Painel de KPIs do Armazém Geral (Módulo 5, WMS, critério #6): ocupação, giro de estoque, avarias por severidade. */
export default function WmsKpiPage() {
  const { armazens } = useArmazensList();
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const { state, kpis, error, reload } = useWmsKpis({
    periodStart: periodStart || undefined,
    periodEnd: periodEnd || undefined,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Warehouse className="h-6 w-6 text-rigabras-500" />
            WMS — Armazém Geral
          </h1>
          <p className="text-sm text-slate-500">
            Ocupação, giro de estoque e avarias — indicadores do serviço de Armazém Geral.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-rigabras-500 focus:outline-none"
          />
          <span className="text-slate-500">até</span>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-rigabras-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        <NavLink
          to="/wms/depositantes"
          icon={<PackageCheck className="h-4 w-4" />}
          label="Depositantes"
        />
        <NavLink
          to="/wms/armazem/mapa"
          icon={<Warehouse className="h-4 w-4" />}
          label="Mapa do armazém"
        />
        <NavLink
          to="/wms/recebimentos"
          icon={<ClipboardList className="h-4 w-4" />}
          label="Recebimentos"
        />
        <NavLink to="/wms/expedicoes" icon={<Truck className="h-4 w-4" />} label="Expedições" />
        <NavLink to="/wms/estoque" icon={<Boxes className="h-4 w-4" />} label="Estoque" />
        <NavLink to="/wms/avarias" icon={<AlertOctagon className="h-4 w-4" />} label="Avarias" />
      </div>

      {armazens.length === 0 && (
        <EmptyState
          title="Nenhum armazém cadastrado"
          description="Cadastre um armazém (tabela `armazens`) para começar a operar o WMS."
        />
      )}

      {state === 'loading' || state === 'idle' ? (
        <LoadingSkeleton rows={4} />
      ) : state === 'error' ? (
        <ErrorCard message={error ?? 'Erro'} onRetry={reload} />
      ) : !kpis ? (
        <EmptyState title="Sem dados" description="Nenhum indicador disponível." />
      ) : (
        <div className="space-y-10">
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Kpi label="Endereços totais" value={kpis.ocupacao.total_enderecos} />
            <Kpi label="Ocupados" value={kpis.ocupacao.enderecos_ocupados} />
            <Kpi label="Livres" value={kpis.ocupacao.enderecos_livres} />
            <Kpi label="% Ocupação" value={`${kpis.ocupacao.percentual_ocupacao}%`} />
            <Kpi
              label="Expedido no período"
              value={kpis.giro_estoque.quantidade_expedida_periodo.toLocaleString('pt-BR')}
            />
            <Kpi
              label="Saldo médio período"
              value={kpis.giro_estoque.saldo_medio_periodo.toLocaleString('pt-BR')}
            />
            <Kpi label="Giro de estoque" value={kpis.giro_estoque.giro ?? '-'} />
            <Kpi label="Recebimentos abertos" value={kpis.recebimentos_abertos} />
            <Kpi label="Expedições abertas" value={kpis.expedicoes_abertas} />
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900">Avarias por severidade</h2>
            {Object.keys(kpis.avarias_por_severidade).length === 0 ? (
              <EmptyState title="Sem avarias no período" description="Nenhuma avaria registrada." />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Object.entries(kpis.avarias_por_severidade).map(([severidade, count]) => (
                  <Kpi key={severidade} label={severidade} value={count} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-bold text-slate-900">{value}</dd>
    </div>
  );
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition-all duration-200 bg-white shadow-sm"
    >
      {icon} {label}
    </Link>
  );
}
