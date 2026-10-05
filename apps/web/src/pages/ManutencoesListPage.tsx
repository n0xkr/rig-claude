import { Link } from 'react-router-dom';
import { Wrench, Plus, Clock3, CalendarClock } from 'lucide-react';
import { useManutencoesList } from '../hooks/useManutencoes.js';
import { useVeiculosList } from '../hooks/useVeiculos.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';
import { ManutencaoTipoBadge } from '../components/StatusBadge.js';
import { formatDateOnly } from '../lib/dateOnly.js';

function decorrido(de: string | undefined): string {
  if (!de) return '';
  const ms = Date.now() - new Date(de).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutos = Math.floor(ms / 60_000);
  if (minutos < 1) return 'agora mesmo';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

interface Previsao {
  rotulo: string;
  classe: string;
}

/** Previsão da próxima manutenção: vencida (vermelho), próxima (âmbar) ou em dia (neutro). */
function previsaoProxima(data: string | undefined): Previsao | null {
  if (!data) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${data}T00:00:00`);
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
  if (dias < 0) return { rotulo: `vencida há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'}`, classe: 'bg-red-50 text-red-700 ring-red-200' };
  if (dias === 0) return { rotulo: 'vence hoje', classe: 'bg-amber-50 text-amber-700 ring-amber-200' };
  if (dias <= 7) return { rotulo: `em ${dias} ${dias === 1 ? 'dia' : 'dias'}`, classe: 'bg-amber-50 text-amber-700 ring-amber-200' };
  return { rotulo: formatDateOnly(data), classe: 'bg-slate-50 text-slate-600 ring-slate-200' };
}

/** Lista de manutenções da frota (Módulo 4, Controle de Frota — "Gestão de Ativos"). */
export default function ManutencoesListPage() {
  const { state, manutencoes, error, reload } = useManutencoesList();
  const { veiculos } = useVeiculosList();
  const placaPorVeiculo = new Map(veiculos.map((v) => [v.id, v.placa]));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wrench className="h-6 w-6 text-amber-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Manutenções da frota</h1>
            <p className="text-sm text-slate-500">
              Solicitação, tipo, custo e previsão da próxima manutenção por veículo.
            </p>
          </div>
        </div>
        <Link
          to="/frota/manutencoes/nova"
          className="flex items-center gap-2 rounded-xl bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-all duration-200"
        >
          <Plus className="h-4 w-4" /> Nova manutenção
        </Link>
      </div>

      {state === 'loading' && <LoadingSkeleton />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro desconhecido'} onRetry={reload} />}

      {state === 'success' && manutencoes.length === 0 && (
        <EmptyState
          title="Nenhuma manutenção registrada"
          description="Registre a primeira manutenção de um veículo da frota."
          actionLabel="Nova manutenção"
          onAction={() => {
            window.location.href = '/frota/manutencoes/nova';
          }}
        />
      )}

      {state === 'success' && manutencoes.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
          {manutencoes.map((m) => {
            const previsao = previsaoProxima(m.proxima_manutencao_data ?? undefined);
            const tempoDecorrido = decorrido(m.created_at);
            return (
              <li key={m.id} data-testid="manutencao-linha">
                <Link
                  to={`/frota/manutencoes/${m.id}`}
                  className="flex items-start justify-between gap-4 px-4 py-4 hover:bg-slate-50 transition-all duration-200"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {placaPorVeiculo.get(m.veiculo_id) ?? m.veiculo_id} — R${' '}
                      {m.custo.toLocaleString('pt-BR')}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                      <span>{formatDateOnly(m.data_manutencao)}</span>
                      {m.hora && (
                        <span className="flex items-center gap-1">
                          · <Clock3 className="h-3 w-3" /> {m.hora}
                        </span>
                      )}
                      {m.solicitante && <span>· solicitante: {m.solicitante}</span>}
                    </p>
                    {m.created_at && (
                      <p className="mt-1 text-xs text-slate-400">
                        Solicitado {new Date(m.created_at).toLocaleString('pt-BR')}
                        {tempoDecorrido && ` (${tempoDecorrido})`}
                      </p>
                    )}
                    {previsao && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
                        <CalendarClock className="h-3.5 w-3.5" /> Próxima manutenção:
                        <span
                          data-testid="proxima-manutencao-badge"
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${previsao.classe}`}
                        >
                          {previsao.rotulo}
                        </span>
                      </p>
                    )}
                  </div>
                  <ManutencaoTipoBadge tipo={m.tipo} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
