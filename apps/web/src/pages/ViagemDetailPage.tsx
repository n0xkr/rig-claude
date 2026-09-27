import { useParams } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useViagemDetail } from '../hooks/useViagemDetail.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';
import { StatusBadge, SeveridadeBadge } from '../components/StatusBadge.js';

export default function ViagemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, viagem, eventos, error, reload } = useViagemDetail(id);

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
