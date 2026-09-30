import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Gauge, Wrench, Fuel } from 'lucide-react';
import { useFrotaKpis } from '../hooks/useFrotaKpis.js';
import { useAtualizarQuilometragem } from '../hooks/useAtualizarQuilometragem.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';

/**
 * Painel de indicadores de frota (Módulo 4, parte A — Controle de Frota):
 * quilometragem (km rodado/vazio), custos e eficiência (custo/km, consumo),
 * utilização (ocupação, disponíveis x em viagem) — filtrável por período e
 * por veículo. Inclui um formulário rápido para registrar km/consumo de uma
 * viagem já concluída, que é o dado que alimenta estes KPIs.
 */
export default function FrotaKpiPage() {
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const { state, kpis, error, reload } = useFrotaKpis({
    periodStart: periodStart || undefined,
    periodEnd: periodEnd || undefined,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Truck className="h-6 w-6 text-rigabras-500" />
            Controle de Frota
          </h1>
          <p className="text-sm text-slate-500">
            Quilometragem, custo/km, consumo médio e ocupação — indicadores prioritários de frota.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="Período: data inicial"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-rigabras-500 focus:outline-none"
          />
          <span className="text-slate-500">até</span>
          <input
            type="date"
            aria-label="Período: data final"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-rigabras-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        <Link
          to="/frota/manutencoes"
          className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition-all duration-200 bg-white shadow-sm"
        >
          <Wrench className="h-4 w-4" /> Manutenções da frota
        </Link>
      </div>

      {state === 'loading' || state === 'idle' ? (
        <LoadingSkeleton rows={4} />
      ) : state === 'error' ? (
        <ErrorCard message={error ?? 'Erro'} onRetry={reload} />
      ) : !kpis ? (
        <EmptyState title="Sem dados" description="Nenhum indicador disponível." />
      ) : (
        <div className="space-y-10">
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi label="Frota ativa" value={kpis.frota_total} />
            <Kpi label="Disponíveis" value={kpis.veiculos_disponiveis} />
            <Kpi label="Em viagem" value={kpis.veiculos_em_viagem} />
            <Kpi label="Ocupação" value={`${kpis.percentual_ocupacao}%`} />
            <Kpi label="Km rodado total" value={kpis.km_rodado_total.toLocaleString('pt-BR')} />
            <Kpi label="Km vazio total" value={kpis.km_vazio_total.toLocaleString('pt-BR')} />
            <Kpi label="% km vazio" value={`${kpis.percentual_km_vazio}%`} />
            <Kpi
              label="% viagens c/ retorno vazio"
              value={`${kpis.percentual_viagens_retorno_vazio}%`}
            />
            <Kpi
              label="Consumo médio"
              value={
                kpis.consumo_medio_km_litro != null ? `${kpis.consumo_medio_km_litro} km/l` : '-'
              }
            />
            <Kpi
              label="Custo/km (manutenção)"
              value={kpis.custo_km_frota != null ? `R$ ${kpis.custo_km_frota}` : '-'}
            />
          </section>

          <QuilometragemForm onSaved={reload} />

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900">Por veículo</h2>
            {kpis.por_veiculo.length === 0 ? (
              <EmptyState
                title="Nenhum veículo cadastrado"
                description="Cadastre veículos no módulo de Gerenciamento de Risco para que apareçam aqui."
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Placa</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Viagens</th>
                      <th className="px-4 py-2 font-medium">Km rodado</th>
                      <th className="px-4 py-2 font-medium">Km vazio</th>
                      <th className="px-4 py-2 font-medium">Consumo médio</th>
                      <th className="px-4 py-2 font-medium">Custo manutenção</th>
                      <th className="px-4 py-2 font-medium">Custo/km</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {kpis.por_veiculo.map((v) => (
                      <tr key={v.veiculo_id} className="text-slate-700">
                        <td className="px-4 py-2 font-medium">{v.placa}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              v.status === 'EM_VIAGEM'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {v.status === 'EM_VIAGEM' ? 'Em viagem' : 'Disponível'}
                          </span>
                        </td>
                        <td className="px-4 py-2">{v.qtd_viagens}</td>
                        <td className="px-4 py-2">{v.km_rodado_total.toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-2">{v.km_vazio_total.toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-2">
                          {v.consumo_medio_km_litro != null
                            ? `${v.consumo_medio_km_litro} km/l`
                            : '-'}
                        </td>
                        <td className="px-4 py-2">
                          R$ {v.custo_manutencao_total.toLocaleString('pt-BR')}
                        </td>
                        <td className="px-4 py-2">
                          {v.custo_km != null ? `R$ ${v.custo_km}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

/** Formulário compacto para registrar km rodado/vazio e consumo de uma viagem — os dados que alimentam os KPIs acima. */
function QuilometragemForm({ onSaved }: { onSaved: () => void }) {
  const { atualizar, submitting, error } = useAtualizarQuilometragem();
  const [viagemId, setViagemId] = useState('');
  const [kmRodado, setKmRodado] = useState('');
  const [kmVazio, setKmVazio] = useState('');
  const [consumo, setConsumo] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (!kmRodado && !kmVazio && !consumo) {
      setFeedback('Informe ao menos km rodado, km vazio ou consumo.');
      return;
    }
    try {
      const { queued } = await atualizar(viagemId.trim(), {
        km_rodado: kmRodado ? Number(kmRodado) : undefined,
        km_vazio: kmVazio ? Number(kmVazio) : undefined,
        consumo_combustivel_litros: consumo ? Number(consumo) : undefined,
      });
      setFeedback(
        queued
          ? 'Sem conexão: dados salvos localmente e serão sincronizados automaticamente.'
          : 'Quilometragem registrada com sucesso.',
      );
      if (!queued) onSaved();
    } catch {
      // erro já exposto via `error`
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
        <Fuel className="h-4 w-4 text-amber-600" /> Registrar quilometragem/consumo de uma viagem
      </h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <input
          required
          placeholder="ID da viagem"
          aria-label="ID da viagem"
          value={viagemId}
          onChange={(e) => setViagemId(e.target.value)}
          className="input col-span-2 sm:col-span-1"
        />
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="Km rodado"
          aria-label="Km rodado"
          value={kmRodado}
          onChange={(e) => setKmRodado(e.target.value)}
          className="input"
        />
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="Km vazio"
          aria-label="Km vazio"
          value={kmVazio}
          onChange={(e) => setKmVazio(e.target.value)}
          className="input"
        />
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="Consumo (litros)"
          aria-label="Consumo (litros)"
          value={consumo}
          onChange={(e) => setConsumo(e.target.value)}
          className="input"
        />
        <button
          type="submit"
          disabled={submitting || !viagemId}
          className="col-span-2 rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 sm:col-span-4 transition-all duration-200"
        >
          {submitting ? 'Salvando...' : 'Salvar'}
        </button>
      </form>
      {feedback && <p className="mt-2 text-sm text-emerald-600">{feedback}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
        <Gauge className="h-3 w-3" /> Preenchido a partir do hodômetro (integração Autotrac é
        trabalho futuro).
      </p>
    </section>
  );
}
