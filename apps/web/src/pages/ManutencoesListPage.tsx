import { Link } from 'react-router-dom';
import { Wrench, Plus } from 'lucide-react';
import { useManutencoesList } from '../hooks/useManutencoes.js';
import { useVeiculosList } from '../hooks/useVeiculos.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';
import { ManutencaoTipoBadge } from '../components/StatusBadge.js';
import { formatDateOnly } from '../lib/dateOnly.js';

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
              Tipo, data, custo e previsão da próxima manutenção por veículo.
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
          {manutencoes.map((m) => (
            <li key={m.id}>
              <Link
                to={`/frota/manutencoes/${m.id}`}
                className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-slate-50 transition-all duration-200"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {placaPorVeiculo.get(m.veiculo_id) ?? m.veiculo_id} — R${' '}
                    {m.custo.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-sm text-slate-500">
                    {formatDateOnly(m.data_manutencao)}
                    {m.proxima_manutencao_data &&
                      ` · próxima em ${formatDateOnly(m.proxima_manutencao_data)}`}
                  </p>
                </div>
                <ManutencaoTipoBadge tipo={m.tipo} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
