import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Truck } from 'lucide-react';
import type { RecebimentoItem } from '@rigabras/shared';
import {
  useRecebimentoDetail,
  useRecebimentoWorkflow,
  useRecebimentoItens,
} from '../hooks/useRecebimentos.js';
import { useProdutosList } from '../hooks/useProdutosArmazenados.js';
import { useEnderecosList, useArmazensList } from '../hooks/useEnderecosArmazem.js';
import { LoadingSkeleton, ErrorCard } from '../components/StateViews.js';
import { RecebimentoStatusBadge } from '../components/StatusBadge.js';
import { OpcaoAdicionarNovo, useCadastroRapido } from '../components/CadastroRapido.js';
import { WmsSubNav } from '../components/WmsSubNav.js';

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
  const { enderecos, reload: reloadEnderecos } = useEnderecosList(armazens[0]?.id);
  const { produtos } = useProdutosList(recebimento?.depositante_id);
  const gestaoItens = useRecebimentoItens();

  if (state === 'loading' || state === 'idle') return <LoadingSkeleton />;
  if (state === 'error' || !recebimento)
    return <ErrorCard message={error ?? 'Erro'} onRetry={reload} />;

  const editavel = recebimento.status === 'AGUARDANDO';
  const rotuloProduto = (produtoId: string) => {
    const p = produtos.find((x) => x.id === produtoId);
    return p ? `${p.sku} — ${p.descricao}` : produtoId.slice(0, 8);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <WmsSubNav />
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
            produtoRotulo={rotuloProduto(item.produto_id)}
            enderecos={enderecos}
            armazemId={armazens[0]?.id}
            recarregarEnderecos={reloadEnderecos}
            disabled={recebimento.status !== 'EM_CONFERENCIA'}
            editavel={editavel}
            onConferido={async (input) => {
              await conferirItem(recebimento.id, item.id, input);
              reload();
            }}
            onAtualizar={async (input) => {
              await gestaoItens.updateItem(recebimento.id, item.id, input);
              reload();
            }}
            onRemover={async () => {
              await gestaoItens.removeItem(recebimento.id, item.id);
              reload();
            }}
          />
        ))}
      </div>

      {editavel && (
        <AdicionarItemForm
          produtos={produtos}
          submitting={gestaoItens.submitting}
          error={gestaoItens.error}
          onAdicionar={async (input) => {
            await gestaoItens.addItem(recebimento.id, input);
            reload();
          }}
        />
      )}

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
  produtoRotulo,
  enderecos,
  disabled,
  editavel,
  onConferido,
  onAtualizar,
  onRemover,
  armazemId,
  recarregarEnderecos,
}: {
  armazemId?: string;
  recarregarEnderecos: () => unknown;
  recebimentoId: string;
  produtoRotulo: string;
  item: RecebimentoItem;
  enderecos: Array<{ id: string; area: string; rua: string; prateleira: string; posicao: string }>;
  disabled: boolean;
  editavel: boolean;
  onConferido: (input: { quantidade_conferida: number; endereco_id: string }) => Promise<void>;
  onAtualizar: (input: { quantidade_esperada?: number; observacoes?: string | null }) => Promise<void>;
  onRemover: () => Promise<void>;
}) {
  const [quantidade, setQuantidade] = useState(String(item.quantidade_esperada));
  const [observacoes, setObservacoes] = useState(item.observacoes ?? '');
  const [enderecoId, setEnderecoId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const novo = useCadastroRapido();
  const jaConferido = item.quantidade_conferida != null;

  const alterado =
    Number(quantidade) !== item.quantidade_esperada || observacoes !== (item.observacoes ?? '');

  return (
    <div className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm" data-testid="recebimento-item">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">{produtoRotulo}</p>
        {editavel && !jaConferido && (
          <button
            type="button"
            data-testid="remover-item"
            onClick={() => void onRemover()}
            className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 transition-all duration-200"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </button>
        )}
      </div>
      <p className="mb-2 text-sm text-slate-600">
        Esperado: <span className="font-medium text-slate-900">{item.quantidade_esperada}</span>
        {jaConferido && (
          <span className="ml-2 text-emerald-600">conferido: {item.quantidade_conferida}</span>
        )}
        {item.observacoes && <span className="ml-2 text-slate-400">· {item.observacoes}</span>}
      </p>
      {!jaConferido && (
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            min={0}
            step="0.001"
            aria-label="Quantidade esperada"
            className="input w-28"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            disabled={disabled && !editavel}
          />
          {editavel && (
            <input
              placeholder="Observações"
              aria-label="Observações do item"
              className="input w-44"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          )}
          {editavel ? (
            <button
              type="button"
              data-testid="salvar-item"
              disabled={!alterado || Number(quantidade) <= 0 || salvando}
              onClick={async () => {
                setSalvando(true);
                try {
                  await onAtualizar({
                    quantidade_esperada: Number(quantidade),
                    observacoes: observacoes || null,
                  });
                } finally {
                  setSalvando(false);
                }
              }}
              className="flex items-center gap-1 rounded-xl bg-rigabras-500 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
            >
              <Pencil className="h-4 w-4" /> Salvar
            </button>
          ) : (
            <>
              <select
                className="input"
                value={enderecoId}
                onChange={novo.aoMudar('endereco', setEnderecoId, recarregarEnderecos, { armazem_id: armazemId })}
                disabled={disabled}
              >
                <option value="">Endereço...</option>
                {enderecos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.area}-{e.rua}-{e.prateleira}-{e.posicao}
                  </option>
                ))}
                <OpcaoAdicionarNovo />
              </select>
              {novo.modal}
              <button
                disabled={disabled || !enderecoId}
                onClick={() =>
                  onConferido({ quantidade_conferida: Number(quantidade), endereco_id: enderecoId })
                }
                className="rounded-xl bg-rigabras-500 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
              >
                Conferir
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AdicionarItemForm({
  produtos,
  submitting,
  error,
  onAdicionar,
}: {
  produtos: Array<{ id: string; sku: string; descricao: string }>;
  submitting: boolean;
  error: string | null;
  onAdicionar: (input: { produto_id: string; quantidade_esperada: number; observacoes?: string | null }) => Promise<void>;
}) {
  const [produtoId, setProdutoId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [observacoes, setObservacoes] = useState('');

  return (
    <form
      data-testid="adicionar-item-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await onAdicionar({
          produto_id: produtoId,
          quantidade_esperada: Number(quantidade),
          observacoes: observacoes || null,
        });
        setProdutoId('');
        setQuantidade('');
        setObservacoes('');
      }}
      className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-dashed border-slate-300 p-4 sm:grid-cols-4"
    >
      <select
        required
        aria-label="Produto"
        className="input"
        value={produtoId}
        onChange={(e) => setProdutoId(e.target.value)}
        data-testid="novo-item-produto"
      >
        <option value="">Produto...</option>
        {produtos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.sku} — {p.descricao}
          </option>
        ))}
      </select>
      <input
        required
        type="number"
        min={0.001}
        step="0.001"
        placeholder="Quantidade"
        aria-label="Quantidade esperada"
        className="input"
        value={quantidade}
        onChange={(e) => setQuantidade(e.target.value)}
        data-testid="novo-item-quantidade"
      />
      <input
        placeholder="Observações"
        aria-label="Observações"
        className="input"
        value={observacoes}
        onChange={(e) => setObservacoes(e.target.value)}
      />
      <button
        type="submit"
        disabled={submitting}
        className="flex items-center justify-center gap-1 rounded-xl bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
        data-testid="adicionar-item-btn"
      >
        <Plus className="h-4 w-4" /> {submitting ? 'Adicionando...' : 'Adicionar item'}
      </button>
      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
