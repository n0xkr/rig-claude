import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPinned } from 'lucide-react';
import type { EtapaFronteira } from '@rigabras/shared';
import { useFronteiraTravessia } from '../hooks/useFronteiraTravessia.js';
import { useFronteiraKpis } from '../hooks/useFronteiraKpis.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';

const ETAPAS: EtapaFronteira[] = [
  'AGENDAMENTO',
  'CHEGADA',
  'GATE',
  'FISCALIZACAO',
  'DESEMBARACO',
  'SAIDA',
  'LIBERACAO',
];

export default function FronteiraTravessiaPage() {
  const { id } = useParams<{ id: string }>();
  const { state, eventos, error, reload, registrarEtapa, submitting } = useFronteiraTravessia(id);
  const { kpis } = useFronteiraKpis({});

  const [etapa, setEtapa] = useState<EtapaFronteira>('AGENDAMENTO');
  const [tempoParado, setTempoParado] = useState('');
  const [motivoRetencao, setMotivoRetencao] = useState('');
  const [custoEspera, setCustoEspera] = useState('');
  const [retrabalho, setRetrabalho] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const kpiViagem = useMemo(
    () => kpis?.porViagem.find((k) => k.viagem_id === id) ?? null,
    [kpis, id],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const result = await registrarEtapa({
      etapa,
      tempo_parado_minutos: tempoParado ? Number(tempoParado) : null,
      motivo_retencao: motivoRetencao || null,
      custo_estimado_espera: custoEspera ? Number(custoEspera) : null,
      retrabalho_documental: retrabalho,
      observacoes: null,
    });
    setFeedback(
      result.queued
        ? 'Sem conexão: etapa salva localmente e será sincronizada automaticamente.'
        : 'Etapa registrada com sucesso.',
    );
    setMotivoRetencao('');
    setCustoEspera('');
    setTempoParado('');
    setRetrabalho(false);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        to={`/viagens/${id}`}
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para a viagem
      </Link>

      <div className="mb-6 flex items-center gap-2">
        <MapPinned className="h-5 w-5 text-purple-400" />
        <h1 className="text-2xl font-bold text-white">Travessia de fronteira</h1>
      </div>

      {kpiViagem && (
        <dl className="mb-8 grid grid-cols-2 gap-4 rounded-lg border border-slate-800 p-4 text-sm sm:grid-cols-3">
          <Kpi label="Tempo parado (min)" value={kpiViagem.tempo_parado_total_minutos} />
          <Kpi label="Tempo desembaraço (min)" value={kpiViagem.tempo_desembaraco_minutos ?? '-'} />
          <Kpi
            label="Tempo total fronteira (min)"
            value={kpiViagem.tempo_total_fronteira_minutos ?? '-'}
          />
          <Kpi label="Retenções" value={kpiViagem.qtd_retencoes} />
          <Kpi label="Retrabalho documental" value={kpiViagem.qtd_retrabalho_documental} />
          <Kpi
            label="Custo estimado espera"
            value={`R$ ${kpiViagem.custo_estimado_espera_total}`}
          />
        </dl>
      )}

      <form
        onSubmit={handleSubmit}
        className="mb-8 space-y-4 rounded-lg border border-slate-800 p-4"
      >
        <h2 className="text-sm font-semibold text-slate-200">Registrar etapa</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs text-slate-400">
            Etapa
            <select
              value={etapa}
              onChange={(e) => setEtapa(e.target.value as EtapaFronteira)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            >
              {ETAPAS.map((et) => (
                <option key={et} value={et}>
                  {et.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Tempo parado (min)
            <input
              type="number"
              min={0}
              value={tempoParado}
              onChange={(e) => setTempoParado(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            Custo estimado de espera
            <input
              type="number"
              min={0}
              value={custoEspera}
              onChange={(e) => setCustoEspera(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <label className="col-span-2 text-xs text-slate-400">
            Motivo da retenção
            <input
              type="text"
              value={motivoRetencao}
              onChange={(e) => setMotivoRetencao(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <label className="col-span-2 flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={retrabalho}
              onChange={(e) => setRetrabalho(e.target.checked)}
            />
            Houve retrabalho documental
          </label>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {submitting ? 'Registrando...' : 'Registrar etapa'}
        </button>
        {feedback && <p className="text-sm text-emerald-400">{feedback}</p>}
      </form>

      {state === 'loading' && <LoadingSkeleton rows={3} />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro'} onRetry={reload} />}
      {state === 'success' && eventos.length === 0 && (
        <EmptyState
          title="Nenhuma etapa registrada"
          description="Registre a primeira etapa da travessia de fronteira desta viagem."
        />
      )}
      {state === 'success' && eventos.length > 0 && (
        <ul className="space-y-3">
          {eventos.map((ev) => (
            <li key={ev.id} className="rounded-lg border border-slate-800 p-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-slate-100">{ev.etapa.replaceAll('_', ' ')}</span>
                <span className="text-xs text-slate-500">
                  {ev.timestamp_etapa ? new Date(ev.timestamp_etapa).toLocaleString('pt-BR') : ''}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                {ev.tempo_parado_minutos != null && (
                  <span>Parado: {ev.tempo_parado_minutos} min</span>
                )}
                {ev.motivo_retencao && <span>Motivo: {ev.motivo_retencao}</span>}
                {ev.custo_estimado_espera != null && (
                  <span>Custo: R$ {ev.custo_estimado_espera}</span>
                )}
                {ev.retrabalho_documental && (
                  <span className="text-amber-400">Retrabalho documental</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-100">{value}</dd>
    </div>
  );
}
