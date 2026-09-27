import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { useFretesList } from '../hooks/useFretes.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';
import { FreteStatusBadge } from '../components/StatusBadge.js';

const STATUS_FILTERS = ['', 'ABERTO', 'EM_CONFERENCIA', 'APROVADO', 'REJEITADO', 'PAGO'];

/**
 * Visão geral do Controle Financeiro do Frete (Módulo 3): lista todos os
 * fretes cadastrados, com filtro por estágio do fechamento. Cada frete é
 * criado a partir da tela de detalhe de uma viagem (`/viagens/:id/frete`);
 * esta tela serve principalmente ao time financeiro para acompanhar o que
 * está pendente de conferência, aprovação ou pagamento.
 */
export default function FretesListPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const { state, fretes, error, reload } = useFretesList(statusFilter || undefined);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Wallet className="h-6 w-6 text-emerald-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Controle Financeiro do Frete</h1>
          <p className="text-sm text-slate-400">
            Frete contratado, fechamento da viagem e saldo — Rigabras Transportes
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s || 'TODOS'}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              statusFilter === s ? 'bg-rigabras-500 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {s ? s.replaceAll('_', ' ') : 'Todos'}
          </button>
        ))}
      </div>

      {state === 'loading' && <LoadingSkeleton />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro desconhecido'} onRetry={reload} />}

      {state === 'success' && fretes.length === 0 && (
        <EmptyState
          title="Nenhum frete cadastrado"
          description="Fretes são registrados a partir da tela de detalhe de uma viagem entregue ou encerrada, na seção de fechamento financeiro."
        />
      )}

      {state === 'success' && fretes.length > 0 && (
        <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
          {fretes.map((f) => (
            <li key={f.id}>
              <Link
                to={`/fretes/${f.id}`}
                className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-slate-900/60"
              >
                <div>
                  <p className="font-medium text-slate-100">
                    {f.numero_fatura ?? 'Sem fatura'} — R${' '}
                    {f.valor_contratado.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-sm text-slate-400">
                    {f.retorno_vazio ? 'Retorno vazio' : 'Retorno com carga (backhaul)'}
                  </p>
                </div>
                <FreteStatusBadge status={f.status_fechamento} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
