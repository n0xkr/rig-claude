import { Link } from 'react-router-dom';
import { Building2, Plus, Package } from 'lucide-react';
import { useDepositantesList } from '../hooks/useDepositantes.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';
import { WmsSubNav } from '../components/WmsSubNav.js';

/** Lista de depositantes (Módulo 5, WMS — clientes do serviço de Armazém Geral, Decreto 1.102/1903). */
export default function DepositantesListPage() {
  const { state, depositantes, error, reload } = useDepositantesList();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <WmsSubNav />
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-rigabras-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Depositantes</h1>
            <p className="text-sm text-slate-500">
              Clientes do Armazém Geral — guarda, conferência e reembalagem de mercadoria de
              terceiros.
            </p>
          </div>
        </div>
        <Link
          to="/wms/depositantes/novo"
          className="flex items-center gap-2 rounded-xl bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-all duration-200"
        >
          <Plus className="h-4 w-4" /> Novo depositante
        </Link>
      </div>

      {state === 'loading' && <LoadingSkeleton />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro desconhecido'} onRetry={reload} />}

      {state === 'success' && depositantes.length === 0 && (
        <EmptyState
          title="Nenhum depositante cadastrado"
          description="Cadastre o primeiro cliente do Armazém Geral."
          actionLabel="Novo depositante"
          onAction={() => {
            window.location.href = '/wms/depositantes/novo';
          }}
        />
      )}

      {state === 'success' && depositantes.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
          {depositantes.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-4 px-4 py-4">
              <div>
                <p className="font-medium text-slate-900">{d.razao_social}</p>
                <p className="text-sm text-slate-500">
                  {d.cnpj_cpf}
                  {d.contato_nome && ` · ${d.contato_nome}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {!d.ativo && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    inativo
                  </span>
                )}
                <Link
                  to={`/wms/produtos?depositanteId=${d.id}`}
                  className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
                >
                  <Package className="h-4 w-4" /> Produtos
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
