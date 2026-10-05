import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useManutencaoDetail, useDeleteManutencao } from '../hooks/useManutencoes.js';
import { useVeiculosList } from '../hooks/useVeiculos.js';
import { LoadingSkeleton, ErrorCard } from '../components/StateViews.js';
import { ManutencaoTipoBadge } from '../components/StatusBadge.js';
import { formatDateOnly } from '../lib/dateOnly.js';

/** Detalhe de uma manutenção de veículo (Módulo 4, Controle de Frota). */
export default function ManutencaoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, manutencao, error, reload } = useManutencaoDetail(id);
  const { veiculos } = useVeiculosList();
  const { remove, submitting, error: deleteError } = useDeleteManutencao();

  const veiculo = veiculos.find((v) => v.id === manutencao?.veiculo_id);

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm('Excluir esta manutenção? Esta ação não pode ser desfeita.')) return;
    try {
      await remove(id);
      navigate('/frota/manutencoes');
    } catch {
      // erro já exposto via `deleteError`
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to="/frota/manutencoes"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para manutenções
      </Link>

      {state === 'loading' && <LoadingSkeleton rows={3} />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro'} onRetry={reload} />}

      {state === 'success' && manutencao && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-2xl font-bold text-slate-900">
              {veiculo?.placa ?? manutencao.veiculo_id}
            </h1>
            <ManutencaoTipoBadge tipo={manutencao.tipo} />
          </div>

          <dl className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 p-6 text-sm bg-white shadow-sm">
            <Info label="Data" value={formatDateOnly(manutencao.data_manutencao)} />
            <Info label="Hora" value={manutencao.hora ?? '-'} />
            <Info label="Custo" value={`R$ ${manutencao.custo.toLocaleString('pt-BR')}`} />
            <Info
              label="Km do veículo"
              value={manutencao.km_veiculo?.toLocaleString('pt-BR') ?? '-'}
            />
            <Info
              label="Próxima manutenção (data)"
              value={
                manutencao.proxima_manutencao_data
                  ? formatDateOnly(manutencao.proxima_manutencao_data)
                  : '-'
              }
            />
            <Info
              label="Próxima manutenção (km)"
              value={manutencao.proxima_manutencao_km?.toLocaleString('pt-BR') ?? '-'}
            />
            <Info label="Solicitante" value={manutencao.solicitante ?? '-'} />
            <Info
              label="Solicitado em"
              value={
                manutencao.created_at
                  ? new Date(manutencao.created_at).toLocaleString('pt-BR')
                  : '-'
              }
            />
          </dl>

          {manutencao.fotos && manutencao.fotos.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-bold text-slate-700">
                Fotos da solicitação ({manutencao.fotos.length})
              </h2>
              <div className="flex flex-wrap gap-3">
                {manutencao.fotos.map((foto, i) => (
                  <a
                    key={`${i}-${foto.length}`}
                    href={foto}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="manutencao-foto"
                  >
                    <img
                      src={foto}
                      alt={`Foto ${i + 1} da manutenção`}
                      className="h-28 w-28 rounded-xl border border-slate-200 object-cover hover:opacity-90 transition-all duration-200"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {manutencao.descricao && (
            <div>
              <h2 className="mb-1 text-sm font-bold text-slate-700">Descrição</h2>
              <p className="text-sm text-slate-500">{manutencao.descricao}</p>
            </div>
          )}
          {manutencao.observacoes && (
            <div>
              <h2 className="mb-1 text-sm font-bold text-slate-700">Observações</h2>
              <p className="text-sm text-slate-500">{manutencao.observacoes}</p>
            </div>
          )}

          <button
            onClick={handleDelete}
            disabled={submitting}
            className="flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition-all duration-200"
          >
            <Trash2 className="h-4 w-4" /> {submitting ? 'Excluindo...' : 'Excluir manutenção'}
          </button>
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-700">{value}</dd>
    </div>
  );
}
