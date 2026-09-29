import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Truck } from 'lucide-react';
import { useRecebimentoDetail, useRecebimentoWorkflow } from '../hooks/useRecebimentos.js';
import { useEnderecosList, useArmazensList } from '../hooks/useEnderecosArmazem.js';
import { LoadingSkeleton, ErrorCard } from '../components/StateViews.js';
import { RecebimentoStatusBadge } from '../components/StatusBadge.js';

/** Detalhe/workflow de um recebimento (Módulo 5, WMS — Recebimento e Conferência): inicia a conferência, confere item a item (endereçando no armazém) e conclui. */
export default function RecebimentoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, recebimento, error, reload } = useRecebimentoDetail(id);
  const {
    iniciarConferencia,
    conferirItem,
    concluirConferencia,
    submitting,
    error: wfError,
  } = useRecebimentoWorkflow();
  const { armazens } = useArmazensList();
  const { enderecos } = useEnderecosList(armazens[0]?.id);

  if (state === 'loading' || state === 'idle') return <LoadingSkeleton />;
  if (state === 'error' || !recebimento)
    return <ErrorCard message={error ?? 'Erro'} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to="/wms/recebimentos"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para recebimentos
      </Link>

      <div className="mb-6 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {recebimento.referencia_documento ?? recebimento.id.slice(0, 8)}
          </h1>
          <p className="text-sm text-slate-500">
            {recebimento.data_prevista &&
              `previsto para ${new Date(`${recebimento.data_prevista}T00:00:00`).toLocaleDateString('pt-BR')}`}
          </p>
        </div>
        <RecebimentoStatusBadge status={recebimento.status ?? 'AGUARDANDO'} />
      </div>

      {recebimento.viagem_id && (
        <Link
          to={`/viagens/${recebimento.viagem_id}`}
          className="mb-6 flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-600 hover:bg-slate-50 transition-all duration-200 bg-white shadow-sm"
        >
          <Truck className="h-4 w-4 text-rigabras-500" />
          Gerado automaticamente pela entrega da viagem (Módulo 6 — Integração TMS+WMS):{' '}
          {recebimento.viagem_id.slice(0, 8)}
        </Link>
      )}

      {recebimento.status === 'AGUARDANDO' && (
        <button
          disabled={submitting}
          onClick={async () => {
            await iniciarConferencia(recebimento.id);
            reload();
          }}
          className="mb-6 rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
        >
          Iniciar conferência
        </button>
      )}

      <div className="space-y-3">
        {recebimento.itens.map((item) => (
          <ItemConferencia
            key={item.id}
            recebimentoId={recebimento.id}
            item={item}
            enderecos={enderecos}
            disabled={recebimento.status !== 'EM_CONFERENCIA'}
            onConferido={async (input) => {
              await conferirItem(recebimento.id, item.id, input);
              reload();
            }}
          />
        ))}
      </div>

      {recebimento.status === 'EM_CONFERENCIA' &&
        recebimento.itens.every((i) => i.quantidade_conferida != null) && (
          <button
            disabled={submitting}
            onClick={async () => {
              await concluirConferencia(recebimento.id);
              reload();
            }}
            className="mt-6 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
          >
            Concluir conferência
          </button>
        )}

      {wfError && <p className="mt-3 text-sm text-red-600">{wfError}</p>}
    </div>
  );
}

function ItemConferencia({
  item,
  enderecos,
  disabled,
  onConferido,
}: {
  recebimentoId: string;
  item: {
    id: string;
    produto_id: string;
    quantidade_esperada: number;
    quantidade_conferida?: number | null;
  };
  enderecos: Array<{ id: string; area: string; rua: string; prateleira: string; posicao: string }>;
  disabled: boolean;
  onConferido: (input: { quantidade_conferida: number; endereco_id: string }) => Promise<void>;
}) {
  const [quantidade, setQuantidade] = useState(String(item.quantidade_esperada));
  const [enderecoId, setEnderecoId] = useState('');
  const jaConferido = item.quantidade_conferida != null;

  return (
    <div className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
      <p className="mb-2 text-sm text-slate-600">
        Esperado: <span className="font-medium text-slate-900">{item.quantidade_esperada}</span>
        {jaConferido && (
          <span className="ml-2 text-emerald-600">conferido: {item.quantidade_conferida}</span>
        )}
      </p>
      {!jaConferido && (
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            min={0}
            step="0.001"
            className="input w-28"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            disabled={disabled}
          />
          <select
            className="input"
            value={enderecoId}
            onChange={(e) => setEnderecoId(e.target.value)}
            disabled={disabled}
          >
            <option value="">Endereço...</option>
            {enderecos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.area}-{e.rua}-{e.prateleira}-{e.posicao}
              </option>
            ))}
          </select>
          <button
            disabled={disabled || !enderecoId}
            onClick={() =>
              onConferido({ quantidade_conferida: Number(quantidade), endereco_id: enderecoId })
            }
            className="rounded-xl bg-rigabras-500 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
          >
            Conferir
          </button>
        </div>
      )}
    </div>
  );
}
