import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Wallet } from 'lucide-react';
import { useFreteByViagem } from '../hooks/useFreteByViagem.js';
import { LoadingSkeleton, ErrorCard } from '../components/StateViews.js';
import { FreteWorkflowView } from '../components/FreteWorkflowView.js';
import { FreteContratadoForm } from '../components/FreteContratadoForm.js';

/**
 * Entrada do Controle Financeiro do Frete (Módulo 3) a partir de uma viagem
 * específica: se a viagem ainda não tem frete contratado registrado, mostra
 * o formulário de registro; caso já exista, mostra o fluxo completo de
 * fechamento (saldo, transições de estado, lançamentos e pagamentos).
 */
export default function ViagemFechamentoPage() {
  const { id } = useParams<{ id: string }>();
  const { state, frete, error, reload } = useFreteByViagem(id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {state === 'success' && frete ? (
        <FreteWorkflowView freteId={frete.id} />
      ) : (
        <>
          <Link
            to={`/viagens/${id}`}
            className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar para a viagem
          </Link>
          <div className="mb-6 flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900">Controle financeiro do frete</h1>
          </div>

          {(state === 'loading' || state === 'idle') && <LoadingSkeleton rows={3} />}
          {state === 'error' && <ErrorCard message={error ?? 'Erro'} onRetry={reload} />}
          {state === 'empty' && id && (
            <>
              <p className="mb-6 text-sm text-slate-500">
                Esta viagem ainda não tem um frete contratado registrado. Ela precisa estar Entregue
                ou Encerrada para abrir o fechamento financeiro.
              </p>
              <FreteContratadoForm viagemId={id} onCreated={reload} />
            </>
          )}
        </>
      )}
    </div>
  );
}
