import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Plus, Search } from 'lucide-react';
import { useVeiculosList, useDeleteVeiculo } from '../hooks/useVeiculos.js';
import { getCurrentUserRole } from '../lib/apiClient.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';
import { VeiculoStatusBadge } from '../components/StatusBadge.js';

const TIPOS: Record<string, string> = {
  CAVALO: 'Cavalo',
  CARRETA_ABERTA: 'Carreta aberta',
  CARRETA_SIDER: 'Carreta sider',
  CARRETA_OUTRO: 'Carreta (outro)',
};

/** Cadastro de veículos da frota (Módulo 1 — TMS): lista, busca e vínculo com manutenções. */
export default function VeiculosListPage() {
  const role = getCurrentUserRole();
  const podeCriar = role === 'SUPERADMIN' || role === 'ADMIN' || role === 'OPERADOR';
  const podeExcluir = role === 'SUPERADMIN' || role === 'ADMIN';
  const { state, veiculos, error, reload } = useVeiculosList();
  const { remove, submitting: excluindo } = useDeleteVeiculo();
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return veiculos
      .filter((v) => mostrarInativos || v.ativo)
      .filter(
        (v) =>
          !q ||
          v.placa.toLowerCase().includes(q) ||
          (v.marca ?? '').toLowerCase().includes(q) ||
          (v.modelo ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => a.placa.localeCompare(b.placa));
  }, [veiculos, busca, mostrarInativos]);

  async function excluir(id: string, placa: string) {
    if (!window.confirm(`Excluir o veículo ${placa}? Esta ação não pode ser desfeita.`)) return;
    try {
      await remove(id);
      reload();
    } catch {
      // erro já exposto via `remove`
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8" data-testid="veiculos-page">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Truck className="h-6 w-6 text-rigabras-500" /> Veículos da frota
          </h1>
          <p className="text-sm text-slate-500">
            Cavalo, carreta e estado operacional — base do controle de manutenções e KPIs.
          </p>
        </div>
        {podeCriar && (
          <Link
            to="/frota/veiculos/novo"
            className="btn-brand"
            data-testid="novo-veiculo"
          >
            <Plus className="h-4 w-4" /> Novo veículo
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por placa, marca ou modelo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            data-testid="veiculos-busca"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={mostrarInativos}
            onChange={(e) => setMostrarInativos(e.target.checked)}
          />
          Mostrar inativos
        </label>
      </div>

      {(state === 'loading' || state === 'idle') && <LoadingSkeleton />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro'} onRetry={reload} />}
      {state === 'success' && lista.length === 0 && (
        <EmptyState
          title={veiculos.length === 0 ? 'Nenhum veículo cadastrado' : 'Nada encontrado'}
          description="Cadastre o primeiro cavalo ou carreta da frota."
        />
      )}
      {state === 'success' && lista.length > 0 && (
        <ul
          className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm"
          data-testid="veiculos-lista"
        >
          {lista.map((v) => (
            <li key={v.id} data-testid="veiculo-linha">
              <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                <Link to={`/frota/veiculos/${v.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">
                    {v.placa}
                    {!v.ativo && <span className="ml-2 text-xs text-slate-400">(inativo)</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {[
                      TIPOS[v.tipo] ?? v.tipo,
                      [v.marca, v.modelo].filter(Boolean).join(' '),
                      v.ano_fabricacao && `${v.ano_fabricacao}`,
                      v.capacidade_kg && `${v.capacidade_kg.toLocaleString('pt-BR')} kg`,
                      v.km_atual != null && `${v.km_atual.toLocaleString('pt-BR')} km`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Sem detalhes informados'}
                  </p>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <VeiculoStatusBadge status={v.status_operacional} />
                  <Link
                    to={`/frota/veiculos/${v.id}`}
                    className="text-xs font-medium text-rigabras-600 hover:underline"
                    data-testid={`editar-veiculo-${v.placa}`}
                  >
                    Editar
                  </Link>
                  {podeExcluir && (
                    <button
                      type="button"
                      onClick={() => void excluir(v.id, v.placa)}
                      disabled={excluindo}
                      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                      data-testid={`excluir-veiculo-${v.placa}`}
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
