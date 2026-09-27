import { Link, useParams } from 'react-router-dom';
import {
  ClipboardCheck,
  History,
  MapPinned,
  PackageSearch,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import { useViagemDetail } from '../hooks/useViagemDetail.js';
import { useViagemStatusHistory } from '../hooks/useViagemStatusHistory.js';
import { useViagemWmsStatus } from '../hooks/useViagemWmsStatus.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';
import {
  StatusBadge,
  SeveridadeBadge,
  ExpedicaoStatusBadge,
  RecebimentoStatusBadge,
} from '../components/StatusBadge.js';

export default function ViagemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, viagem, eventos, error, reload } = useViagemDetail(id);
  const { historico, state: historicoState } = useViagemStatusHistory(id);
  const { status: wmsStatus, state: wmsState } = useViagemWmsStatus(id);

  if (state === 'loading' || state === 'idle')
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <LoadingSkeleton rows={3} />
      </div>
    );
  if (state === 'error')
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <ErrorCard message={error ?? 'Erro'} onRetry={reload} />
      </div>
    );
  if (!viagem) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{viagem.numero_crt ?? 'CRT pendente'}</h1>
          <p className="text-sm text-slate-400">
            {viagem.origem} → {viagem.destino} ({viagem.pais_destino})
          </p>
        </div>
        <StatusBadge status={viagem.status} />
      </div>

      <dl className="mb-8 grid grid-cols-2 gap-4 rounded-lg border border-slate-800 p-4 text-sm">
        <Info label="Placa do cavalo" value={viagem.placa_cavalo} />
        <Info label="MIC/DTA" value={viagem.numero_mic_dta ?? '-'} />
        <Info label="Peso (kg)" value={viagem.peso_kg?.toString() ?? '-'} />
        <Info
          label="Valor do frete"
          value={viagem.valor_frete ? `R$ ${viagem.valor_frete}` : '-'}
        />
      </dl>

      <div className="mb-8 flex flex-wrap gap-3">
        <Link
          to={`/viagens/${viagem.id}/fronteira`}
          className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900/60"
        >
          <MapPinned className="h-4 w-4" /> Travessia de fronteira
        </Link>
        <Link
          to={`/viagens/${viagem.id}/validacao-pre-embarque`}
          className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900/60"
        >
          <ClipboardCheck className="h-4 w-4" /> Validação pré-embarque
        </Link>
        <Link
          to={`/viagens/${viagem.id}/frete`}
          className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900/60"
        >
          <Wallet className="h-4 w-4" /> Fechamento financeiro do frete
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <History className="h-5 w-5 text-slate-400" />
        <h2 className="text-lg font-semibold text-white">Linha do tempo do ciclo de vida</h2>
      </div>

      {historicoState === 'loading' ? (
        <LoadingSkeleton rows={2} />
      ) : historico.length === 0 ? (
        <p className="mb-8 text-sm text-slate-500">Nenhuma transição de status registrada ainda.</p>
      ) : (
        <ol className="mb-8 space-y-3 border-l border-slate-800 pl-4">
          {historico.map((h) => {
            const isWms = h.origem_evento === 'WMS';
            return (
              <li key={h.id} className="relative">
                <span
                  className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${isWms ? 'bg-amber-500' : 'bg-rigabras-500'}`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {isWms ? (
                    <span className="inline-flex items-center gap-1 rounded border border-amber-700 bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                      <PackageSearch className="h-3 w-3" /> WMS
                    </span>
                  ) : (
                    h.status_anterior && (
                      <span className="text-xs text-slate-500">
                        {h.status_anterior.replaceAll('_', ' ')} →
                      </span>
                    )
                  )}
                  {!isWms && <StatusBadge status={h.status_novo} />}
                  <span className="text-xs text-slate-500">
                    {h.created_at ? new Date(h.created_at).toLocaleString('pt-BR') : ''}
                  </span>
                </div>
                {h.observacoes && <p className="mt-1 text-sm text-slate-400">{h.observacoes}</p>}
              </li>
            );
          })}
        </ol>
      )}

      <div className="mb-4 flex items-center gap-2">
        <PackageSearch className="h-5 w-5 text-slate-400" />
        <h2 className="text-lg font-semibold text-white">Integração com o armazém (WMS)</h2>
      </div>

      {wmsState === 'loading' ? (
        <LoadingSkeleton rows={1} />
      ) : !wmsStatus || (!wmsStatus.expedicao && !wmsStatus.recebimento) ? (
        <p className="mb-8 text-sm text-slate-500">
          Nenhuma expedição ou recebimento do armazém vinculados a esta viagem ainda.
        </p>
      ) : (
        <div className="mb-8 space-y-3">
          {wmsStatus.expedicao && (
            <Link
              to={`/wms/expedicoes/${wmsStatus.expedicao.id}`}
              className="flex items-center justify-between rounded-lg border border-slate-800 p-4 hover:bg-slate-900/60"
            >
              <div>
                <p className="text-sm text-slate-400">Expedição vinculada</p>
                <p className="font-medium text-slate-100">
                  {wmsStatus.expedicao.referencia_documento ?? wmsStatus.expedicao.id.slice(0, 8)}
                </p>
              </div>
              <ExpedicaoStatusBadge status={wmsStatus.expedicao.status ?? 'SOLICITADA'} />
            </Link>
          )}
          {wmsStatus.recebimento && (
            <Link
              to={`/wms/recebimentos/${wmsStatus.recebimento.id}`}
              className="flex items-center justify-between rounded-lg border border-slate-800 p-4 hover:bg-slate-900/60"
            >
              <div>
                <p className="text-sm text-slate-400">Recebimento gerado a partir da entrega</p>
                <p className="font-medium text-slate-100">
                  {wmsStatus.recebimento.referencia_documento ??
                    wmsStatus.recebimento.id.slice(0, 8)}
                </p>
              </div>
              <RecebimentoStatusBadge status={wmsStatus.recebimento.status ?? 'AGUARDANDO'} />
            </Link>
          )}
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-amber-400" />
        <h2 className="text-lg font-semibold text-white">Eventos de risco</h2>
      </div>

      {eventos.length === 0 ? (
        <EmptyState
          title="Nenhum evento de risco registrado"
          description="Esta viagem ainda não possui ocorrências registradas pelo monitoramento ou pela análise de IA."
        />
      ) : (
        <ul className="space-y-3">
          {eventos.map((ev) => (
            <li key={ev.id} className="rounded-lg border border-slate-800 p-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-slate-100">{ev.tipo}</span>
                <SeveridadeBadge severidade={ev.severidade} />
              </div>
              <p className="text-sm text-slate-400">{ev.descricao}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-100">{value}</dd>
    </div>
  );
}
