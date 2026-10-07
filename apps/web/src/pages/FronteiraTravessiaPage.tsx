import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPinned } from 'lucide-react';
import type { EtapaFronteira } from '@rigabras/shared';
import { ApiError } from '../lib/apiClient.js';
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
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const kpiViagem = useMemo(
    () => kpis?.porViagem.find((k) => k.viagem_id === id) ?? null,
    [kpis, id],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setErroEnvio(null);
    let result: { queued: boolean };
    try {
      result = await registrarEtapa({
        etapa,
        // `eventos_fronteira.tempo_parado_minutos` é integer no banco.
        tempo_parado_minutos: tempoParado ? Math.round(Number(tempoParado)) : null,
        motivo_retencao: motivoRetencao || null,
        custo_estimado_espera: custoEspera ? Number(custoEspera) : null,
        retrabalho_documental: retrabalho,
        observacoes: null,
      });
    } catch (err) {
      setErroEnvio(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      return;
    }
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
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to={`/viagens/${id}`}
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para a viagem
      </Link>

      <div className="mb-6 flex items-center gap-2">
        <MapPinned className="h-5 w-5 text-purple-600" />
        <h1 className="text-2xl font-bold text-slate-900">Travessia de fronteira</h1>
      </div>

      {kpiViagem && (
        <dl className="mb-8 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 p-6 text-sm sm:grid-cols-3 bg-white shadow-sm">
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
        className="mb-8 space-y-4 rounded-xl border border-slate-200 p-6 bg-white shadow-sm"
      >
        <h2 className="text-sm font-bold text-slate-700">Registrar etapa</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs text-slate-500">
            Etapa
            <select
              value={etapa}
              onChange={(e) => setEtapa(e.target.value as EtapaFronteira)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
            >
              {ETAPAS.map((et) => (
                <option key={et} value={et}>
                  {et.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Tempo parado (min)
            <input
              type="number"
              min={0}
              value={tempoParado}
              onChange={(e) => setTempoParado(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
            />
          </label>
          <label className="text-xs text-slate-500">
            Custo estimado de espera
            <input
              type="number"
              min={0}
              value={custoEspera}
              onChange={(e) => setCustoEspera(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
            />
          </label>
          <label className="col-span-2 text-xs text-slate-500">
            Motivo da retenção
            <input
              type="text"
              value={motivoRetencao}
              onChange={(e) => setMotivoRetencao(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
            />
          </label>
          <label className="col-span-2 flex items-center gap-2 text-xs text-slate-500">
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
          className="rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
        >
          {submitting ? 'Registrando...' : 'Registrar etapa'}
        </button>
        {feedback && <p className="text-sm text-emerald-600">{feedback}</p>}
        {erroEnvio && <p className="text-sm text-red-600">{erroEnvio}</p>}
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
            <li key={ev.id} className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-slate-900">{ev.etapa.replaceAll('_', ' ')}</span>
                <span className="text-xs text-slate-500">
                  {ev.timestamp_etapa ? new Date(ev.timestamp_etapa).toLocaleString('pt-BR') : ''}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                {ev.tempo_parado_minutos != null && (
                  <span>Parado: {ev.tempo_parado_minutos} min</span>
                )}
                {ev.motivo_retencao && <span>Motivo: {ev.motivo_retencao}</span>}
                {ev.custo_estimado_espera != null && (
                  <span>Custo: R$ {ev.custo_estimado_espera}</span>
                )}
                {ev.retrabalho_documental && (
                  <span className="text-amber-600">Retrabalho documental</span>
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
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
