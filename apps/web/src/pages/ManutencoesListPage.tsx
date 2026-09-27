import { Link } from 'react-router-dom';
import { Wrench, Plus } from 'lucide-react';
import { useManutencoesList } from '../hooks/useManutencoes.js';
import { useVeiculosList } from '../hooks/useVeiculos.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';
import { ManutencaoTipoBadge } from '../components/StatusBadge.js';

/** Lista de manutenções da frota (Módulo 4, Controle de Frota — "Gestão de Ativos"). */
export default function ManutencoesListPage() {
  const { state, manutencoes, error, reload } = useManutencoesList();
  const { veiculos } = useVeiculosList();
  const placaPorVeiculo = new Map(veiculos.map((v) => [v.id, v.placa]));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wrench className="h-6 w-6 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Manutenções da frota</h1>
            <p className="text-sm text-slate-400">
              Tipo, data, custo e previsão da próxima manutenção por veículo.
            </p>
          </div>
        </div>
        <Link
          to="/frota/manutencoes/nova"
          className="flex items-center gap-2 rounded-md bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
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
        <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
          {manutencoes.map((m) => (
            <li key={m.id}>
              <Link
                to={`/frota/manutencoes/${m.id}`}
                className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-slate-900/60"
              >
                <div>
                  <p className="font-medium text-slate-100">
                    {placaPorVeiculo.get(m.veiculo_id) ?? m.veiculo_id} — R${' '}
                    {m.custo.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-sm text-slate-400">
                    {new Date(m.data_manutencao).toLocaleDateString('pt-BR')}
                    {m.proxima_manutencao_data &&
                      ` · próxima em ${new Date(m.proxima_manutencao_data).toLocaleDateString('pt-BR')}`}
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
