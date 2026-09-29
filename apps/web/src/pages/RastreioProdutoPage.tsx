import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, History } from 'lucide-react';
import { useRastreioProduto } from '../hooks/useRastreioProduto.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';

/** Rastreabilidade de um produto (Módulo 5, WMS, critério #6 — "traceability"): histórico completo de movimentações de estoque + saldo atual. */
export default function RastreioProdutoPage() {
  const { produtoId } = useParams<{ produtoId: string }>();
  const { state, rastreio, error, reload } = useRastreioProduto(produtoId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to="/wms/produtos"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para produtos
      </Link>
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold text-slate-900">
        <History className="h-6 w-6 text-rigabras-500" /> Rastreabilidade do produto
      </h1>

      {state === 'loading' && <LoadingSkeleton />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro'} onRetry={reload} />}

      {state === 'success' && rastreio && (
        <>
          <p className="mb-4 text-sm text-slate-600">
            Saldo atual total:{' '}
            <span className="font-semibold text-slate-900">{rastreio.saldo_atual_total}</span>
          </p>

          {rastreio.eventos.length === 0 ? (
            <EmptyState
              title="Sem movimentações"
              description="Este produto ainda não teve nenhuma movimentação de estoque."
            />
          ) : (
            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
              {rastreio.eventos.map((ev) => (
                <li key={ev.movimentacao_id} className="px-4 py-3 text-sm">
                  <p className="font-medium text-slate-900">
                    {ev.tipo_movimentacao.replaceAll('_', ' ')} — {ev.quantidade}
                  </p>
                  <p className="text-slate-500">
                    {new Date(ev.created_at).toLocaleString('pt-BR')}
                    {ev.referencia_documento && ` · ${ev.referencia_documento}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
