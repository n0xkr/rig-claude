import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, WifiOff, ShieldAlert, History } from 'lucide-react';
import type { TipoEventoJornada } from '@rigabras/shared';
import { useMotoristasList } from '../hooks/useMotoristas.js';
import {
  useRegistrarJornadaEvento,
  useJornadaEventosByMotorista,
} from '../hooks/useJornadaEventos.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';
import { EventoJornadaBadge } from '../components/StatusBadge.js';

const TIPOS_EVENTO: TipoEventoJornada[] = [
  'INICIO_JORNADA',
  'INICIO_DIRECAO',
  'FIM_DIRECAO',
  'INICIO_ESPERA',
  'FIM_ESPERA',
  'INICIO_DESCANSO',
  'FIM_DESCANSO',
  'FIM_JORNADA',
];

/**
 * Registro contínuo de jornada (Módulo 4, Controle de Jornada — ADI 5322):
 * log de eventos pontuais e imutáveis (início/fim de jornada, direção,
 * espera, descanso). Cada lançamento é validado pela máquina de estados no
 * backend (não é possível, por exemplo, lançar `FIM_DIRECAO` sem um
 * `INICIO_DIRECAO` em aberto).
 */
export default function JornadaRegistroPage() {
  const { motoristas, state: motoristasState } = useMotoristasList();
  const [motoristaId, setMotoristaId] = useState('');
  const [tipoEvento, setTipoEvento] = useState<TipoEventoJornada>('INICIO_JORNADA');
  const [viagemId, setViagemId] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const { registrar, submitting, error } = useRegistrarJornadaEvento();
  const {
    state,
    eventos,
    error: listError,
    reload,
  } = useJornadaEventosByMotorista(motoristaId || undefined);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    try {
      const { queued } = await registrar({
        motorista_id: motoristaId,
        viagem_id: viagemId.trim() || null,
        tipo_evento: tipoEvento,
        timestamp_evento: new Date().toISOString(),
      });
      setFeedback(
        queued
          ? 'Sem conexão: evento salvo localmente e será sincronizado automaticamente.'
          : 'Evento registrado com sucesso.',
      );
      if (!queued) void reload();
    } catch {
      // erro já exposto via `error`
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center gap-2">
        <Clock className="h-6 w-6 text-purple-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Controle de Jornada</h1>
          <p className="text-sm text-slate-500">
            Registro contínuo de jornada do motorista — tempo de espera conta como jornada (STF ADI
            5322).
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          to="/jornada/alertas"
          className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition-all duration-200 bg-white shadow-sm"
        >
          <ShieldAlert className="h-4 w-4" /> Alertas de conformidade
        </Link>
        {motoristaId && (
          <Link
            to={`/jornada/motoristas/${motoristaId}/historico`}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition-all duration-200 bg-white shadow-sm"
          >
            <History className="h-4 w-4" /> Histórico consolidado
          </Link>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="mb-8 space-y-4 rounded-xl border border-slate-200 p-6 bg-white shadow-sm"
      >
        <h2 className="text-sm font-bold text-slate-700">Registrar evento</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs text-slate-500">
            Motorista *
            <select
              required
              disabled={motoristasState === 'loading'}
              value={motoristaId}
              onChange={(e) => setMotoristaId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
            >
              <option value="">Selecione...</option>
              {motoristas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome_completo}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Tipo de evento *
            <select
              value={tipoEvento}
              onChange={(e) => setTipoEvento(e.target.value as TipoEventoJornada)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
            >
              {TIPOS_EVENTO.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Viagem (opcional)
            <input
              value={viagemId}
              onChange={(e) => setViagemId(e.target.value)}
              placeholder="ID da viagem"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={submitting || !motoristaId}
          className="rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
        >
          {submitting ? 'Registrando...' : 'Registrar evento'}
        </button>
        {feedback && (
          <div className="flex items-center gap-2 text-sm text-emerald-600">
            <WifiOff className="h-4 w-4 shrink-0" /> {feedback}
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {motoristaId && (
        <>
          <h2 className="mb-3 text-lg font-bold text-slate-900">Eventos recentes</h2>
          {state === 'loading' && <LoadingSkeleton rows={3} />}
          {state === 'error' && <ErrorCard message={listError ?? 'Erro'} onRetry={reload} />}
          {state === 'success' && eventos.length === 0 && (
            <EmptyState
              title="Nenhum evento registrado"
              description="Registre o primeiro evento de jornada deste motorista (deve ser INICIO_JORNADA)."
            />
          )}
          {state === 'success' && eventos.length > 0 && (
            <ul className="space-y-2">
              {[...eventos]
                .reverse()
                .slice(0, 20)
                .map((ev) => (
                  <li
                    key={ev.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2 bg-white shadow-sm"
                  >
                    <EventoJornadaBadge tipo={ev.tipo_evento} />
                    <span className="text-xs text-slate-500">
                      {ev.timestamp_evento
                        ? new Date(ev.timestamp_evento).toLocaleString('pt-BR')
                        : ''}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
