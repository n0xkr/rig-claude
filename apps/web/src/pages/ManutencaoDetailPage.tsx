import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useManutencaoDetail, useDeleteManutencao } from '../hooks/useManutencoes.js';
import { useVeiculosList } from '../hooks/useVeiculos.js';
import { LoadingSkeleton, ErrorCard } from '../components/StateViews.js';
import { ManutencaoTipoBadge } from '../components/StatusBadge.js';

/** Detalhe de uma manutenção de veículo (Módulo 4, Controle de Frota). */
export default function ManutencaoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, manutencao, error, reload } = useManutencaoDetail(id);
  const { veiculos } = useVeiculosList();
  const { remove, submitting } = useDeleteManutencao();

  const veiculo = veiculos.find((v) => v.id === manutencao?.veiculo_id);

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm('Excluir esta manutenção? Esta ação não pode ser desfeita.')) return;
    await remove(id);
    navigate('/frota/manutencoes');
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        to="/frota/manutencoes"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para manutenções
      </Link>

      {state === 'loading' && <LoadingSkeleton rows={3} />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro'} onRetry={reload} />}

      {state === 'success' && manutencao && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-2xl font-bold text-white">
              {veiculo?.placa ?? manutencao.veiculo_id}
            </h1>
            <ManutencaoTipoBadge tipo={manutencao.tipo} />
          </div>

          <dl className="grid grid-cols-2 gap-4 rounded-lg border border-slate-800 p-4 text-sm">
            <Info
              label="Data"
              value={new Date(manutencao.data_manutencao).toLocaleDateString('pt-BR')}
            />
            <Info label="Custo" value={`R$ ${manutencao.custo.toLocaleString('pt-BR')}`} />
            <Info
              label="Km do veículo"
              value={manutencao.km_veiculo?.toLocaleString('pt-BR') ?? '-'}
            />
            <Info
              label="Próxima manutenção (data)"
              value={
                manutencao.proxima_manutencao_data
                  ? new Date(manutencao.proxima_manutencao_data).toLocaleDateString('pt-BR')
                  : '-'
              }
            />
            <Info
              label="Próxima manutenção (km)"
              value={manutencao.proxima_manutencao_km?.toLocaleString('pt-BR') ?? '-'}
            />
          </dl>

          {manutencao.descricao && (
            <div>
              <h2 className="mb-1 text-sm font-semibold text-slate-200">Descrição</h2>
              <p className="text-sm text-slate-400">{manutencao.descricao}</p>
            </div>
          )}
          {manutencao.observacoes && (
            <div>
              <h2 className="mb-1 text-sm font-semibold text-slate-200">Observações</h2>
              <p className="text-sm text-slate-400">{manutencao.observacoes}</p>
            </div>
          )}

          <button
            onClick={handleDelete}
            disabled={submitting}
            className="flex items-center gap-2 rounded-md border border-red-800 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-950/40 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> {submitting ? 'Excluindo...' : 'Excluir manutenção'}
          </button>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-200">{value}</dd>
    </div>
  );
}
