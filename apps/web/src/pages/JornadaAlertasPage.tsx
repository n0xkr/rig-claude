import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useJornadaAlertas } from '../hooks/useJornadaAlertas.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';
import { AchadoList } from '../components/AchadoList.js';

/**
 * Painel de alertas de conformidade ADI 5322 (Módulo 4, Controle de
 * Jornada): motoristas ATIVOS cujos eventos recentes produzem ao menos um
 * achado de risco (AVISO/BLOQUEANTE) — jornada excessiva, direção acima do
 * limite ou descanso insuficiente/fracionado.
 */
export default function JornadaAlertasPage() {
  const { state, alertas, error, reload } = useJornadaAlertas();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to="/jornada"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para registro de jornada
      </Link>

      <div className="mb-6 flex items-center gap-2">
        <ShieldAlert className="h-6 w-6 text-red-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Alertas de conformidade — ADI 5322</h1>
          <p className="text-sm text-slate-500">
            Motoristas com jornada excessiva, direção acima do limite ou descanso
            insuficiente/fracionado nos últimos 7 dias.
          </p>
        </div>
      </div>

      {state === 'loading' && <LoadingSkeleton rows={4} />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro'} onRetry={reload} />}

      {state === 'success' && alertas.length === 0 && (
        <EmptyState
          title="Nenhum alerta ativo"
          description="Nenhum motorista ativo apresenta achados de risco (AVISO/BLOQUEANTE) na janela recente."
        />
      )}

      {state === 'success' && alertas.length > 0 && (
        <ul className="space-y-4">
          {alertas.map((alerta) => (
            <li
              key={alerta.motorista_id}
              className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{alerta.motorista_nome}</span>
                  {alerta.sessao_aberta && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                      Jornada em andamento
                    </span>
                  )}
                </div>
                <Link
                  to={`/jornada/motoristas/${alerta.motorista_id}/historico`}
                  className="text-xs text-slate-500 hover:text-slate-900 transition-all duration-200"
                >
                  Ver histórico completo
                </Link>
              </div>
              <AchadoList achados={alerta.achados} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
