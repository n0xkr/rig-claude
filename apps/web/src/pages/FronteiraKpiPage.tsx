import { useState } from 'react';
import { Gauge, Timer } from 'lucide-react';
import { useFronteiraKpis } from '../hooks/useFronteiraKpis.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';

/**
 * Painel de KPIs de travessia de fronteira (Módulo 2, critério #2):
 * tempo parado, tempo de desembaraço, retenção, retrabalho documental,
 * motivo da retenção, custo estimado da espera — com performance agregada
 * por viagem e por rota.
 */
export default function FronteiraKpiPage() {
  const [rota, setRota] = useState('');
  const { state, kpis, error, reload } = useFronteiraKpis({ rota: rota || undefined });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Gauge className="h-6 w-6 text-rigabras-500" />
            KPIs de fronteira
          </h1>
          <p className="text-sm text-slate-500">
            Tempo parado, tempo de desembaraço, retenções, retrabalho documental e custo estimado da
            espera — por viagem e por rota.
          </p>
        </div>
        <input
          value={rota}
          onChange={(e) => setRota(e.target.value)}
          placeholder="Filtrar por rota (ex: Curitiba -> Assunção)"
          className="w-72 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-rigabras-500 focus:outline-none"
        />
      </div>

      {state === 'loading' || state === 'idle' ? (
        <LoadingSkeleton rows={4} />
      ) : state === 'error' ? (
        <ErrorCard message={error ?? 'Erro'} onRetry={reload} />
      ) : !kpis || kpis.porViagem.length === 0 ? (
        <EmptyState
          title="Nenhum evento de fronteira registrado"
          description="Assim que etapas de travessia (agendamento, chegada, gate, fiscalização, desembaraço, saída, liberação) forem lançadas, os KPIs aparecerão aqui."
        />
      ) : (
        <div className="space-y-10">
          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900">Performance por rota</h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Rota</th>
                    <th className="px-4 py-2 font-medium">Viagens</th>
                    <th className="px-4 py-2 font-medium">Tempo parado médio (min)</th>
                    <th className="px-4 py-2 font-medium">Tempo desembaraço médio (min)</th>
                    <th className="px-4 py-2 font-medium">Custo estimado da espera</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {kpis.porRota.map((r) => (
                    <tr key={r.rota} className="text-slate-700">
                      <td className="px-4 py-2">{r.rota}</td>
                      <td className="px-4 py-2">{r.qtd_viagens}</td>
                      <td className="px-4 py-2">{r.tempo_parado_medio_minutos}</td>
                      <td className="px-4 py-2">{r.tempo_desembaraco_medio_minutos}</td>
                      <td className="px-4 py-2">
                        R$ {r.custo_estimado_espera_total.toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900">
              <Timer className="h-5 w-5 text-amber-600" /> Performance por viagem
            </h2>
            <ul className="space-y-3">
              {kpis.porViagem.map((v) => (
                <li
                  key={v.viagem_id}
                  className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium text-slate-900">
                      {v.numero_crt ?? 'CRT pendente'} — {v.placa_cavalo}
                    </span>
                    <span className="text-xs text-slate-500">
                      {v.etapas_registradas} etapa(s) registrada(s)
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-4 text-sm text-slate-500 sm:grid-cols-4">
                    <Info
                      label="Tempo parado total"
                      value={`${v.tempo_parado_total_minutos} min`}
                    />
                    <Info
                      label="Tempo de desembaraço"
                      value={
                        v.tempo_desembaraco_minutos != null
                          ? `${v.tempo_desembaraco_minutos} min`
                          : '-'
                      }
                    />
                    <Info label="Retenções" value={String(v.qtd_retencoes)} />
                    <Info
                      label="Retrabalho documental"
                      value={String(v.qtd_retrabalho_documental)}
                    />
                  </dl>
                  {v.motivos_retencao.length > 0 && (
                    <p className="mt-2 text-xs text-amber-700">
                      Motivos de retenção: {v.motivos_retencao.join(', ')}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    Custo estimado da espera: R${' '}
                    {v.custo_estimado_espera_total.toLocaleString('pt-BR')}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-700">{value}</dd>
    </div>
  );
}
