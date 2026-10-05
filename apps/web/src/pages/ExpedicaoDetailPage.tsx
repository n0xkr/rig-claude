import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Truck } from 'lucide-react';
import {
  useExpedicaoDetail,
  useExpedicaoWorkflow,
  useExpedicaoItens,
} from '../hooks/useExpedicoes.js';
import { useProdutosList } from '../hooks/useProdutosArmazenados.js';
import { useEnderecosList, useArmazensList } from '../hooks/useEnderecosArmazem.js';
import { LoadingSkeleton, ErrorCard } from '../components/StateViews.js';
import { ExpedicaoStatusBadge } from '../components/StatusBadge.js';
import { WmsSubNav } from '../components/WmsSubNav.js';
import { OpcaoAdicionarNovo, useCadastroRapido } from '../components/CadastroRapido.js';

const PROXIMA_ACAO: Record<
  string,
  {
    label: string;
    acao: 'iniciarSeparacao' | 'concluirSeparacao' | 'marcarProntaExpedicao' | 'expedir';
  } | null
> = {
  SOLICITADA: { label: 'Iniciar separação', acao: 'iniciarSeparacao' },
  EM_SEPARACAO: { label: 'Concluir separação', acao: 'concluirSeparacao' },
  SEPARADA: { label: 'Marcar pronta para expedição', acao: 'marcarProntaExpedicao' },
  EM_REEMBALAGEM: { label: 'Marcar pronta para expedição', acao: 'marcarProntaExpedicao' },
  PRONTA_EXPEDICAO: { label: 'Expedir', acao: 'expedir' },
  EXPEDIDA: null,
  CANCELADA: null,
};

/** Detalhe/workflow de uma expedição (Módulo 5, WMS): separação por endereço, reembalagem/etiquetagem, cross-docking e expedição final. */
export default function ExpedicaoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, expedicao, error, reload } = useExpedicaoDetail(id);
  const workflow = useExpedicaoWorkflow();
  const gestaoItens = useExpedicaoItens();
  const { armazens } = useArmazensList();
  const { enderecos, reload: reloadEnderecos } = useEnderecosList(armazens[0]?.id);
  const { produtos, reload: reloadProdutos } = useProdutosList(expedicao?.depositante_id);

  if (state === 'loading' || state === 'idle') return <LoadingSkeleton />;
  if (state === 'error' || !expedicao)
    return <ErrorCard message={error ?? 'Erro'} onRetry={reload} />;

  const proxima = PROXIMA_ACAO[expedicao.status ?? 'SOLICITADA'];
  const editavel = expedicao.status === 'SOLICITADA';
  const rotuloProduto = (produtoId: string) => {
    const p = produtos.find((x) => x.id === produtoId);
    return p ? `${p.sku} — ${p.descricao}` : produtoId.slice(0, 8);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <WmsSubNav />
      <Link
        to="/wms/expedicoes"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para expedições
      </Link>

      <div className="mb-6 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {expedicao.referencia_documento ?? expedicao.id.slice(0, 8)}
          </h1>
          <p className="text-sm text-slate-500">
            {expedicao.tipo === 'CROSS_DOCKING' ? 'Cross-docking' : 'Normal'}
          </p>
        </div>
        <ExpedicaoStatusBadge status={expedicao.status ?? 'SOLICITADA'} />
      </div>

      {expedicao.viagem_id && (
        <Link
          to={`/viagens/${expedicao.viagem_id}`}
          className="mb-6 flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-600 hover:bg-slate-50 transition-all duration-200 bg-white shadow-sm"
        >
          <Truck className="h-4 w-4 text-rigabras-500" />
          Viagem vinculada (Módulo 6 — Integração TMS+WMS): {expedicao.viagem_id.slice(0, 8)}
        </Link>
      )}

      <div className="space-y-3">
        {expedicao.itens.map((item) => (
          <ItemSeparacao
            key={item.id}
            item={item}
            produtoRotulo={rotuloProduto(item.produto_id)}
            enderecos={enderecos}
            armazemId={armazens[0]?.id}
            onEnderecoCriado={reloadEnderecos}
            editavel={editavel}
            podeSeparar={expedicao.status === 'SOLICITADA' || expedicao.status === 'EM_SEPARACAO'}
            onSeparar={async (input) => {
              await workflow.separarItem(expedicao.id, item.id, input);
              reload();
            }}
            onFlag={async (flags) => {
              await workflow.marcarReembalagemEtiquetagem(expedicao.id, item.id, flags);
              reload();
            }}
            onAtualizar={async (input) => {
              await gestaoItens.updateItem(expedicao.id, item.id, input);
              reload();
            }}
            onRemover={async () => {
              await gestaoItens.removeItem(expedicao.id, item.id);
              reload();
            }}
          />
        ))}
      </div>

      {editavel && (
        <AdicionarItemExpedicaoForm
          produtos={produtos}
          depositanteId={expedicao.depositante_id}
          onProdutoCriado={reloadProdutos}
          submitting={gestaoItens.submitting}
          error={gestaoItens.error}
          onAdicionar={async (input) => {
            await gestaoItens.addItem(expedicao.id, input);
            reload();
          }}
        />
      )}

      <div className="mt-6 flex gap-2">
        {proxima && (
          <button
            disabled={workflow.submitting}
            onClick={async () => {
              await workflow[proxima.acao](expedicao.id);
              reload();
            }}
            className="rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
          >
            {proxima.label}
          </button>
        )}
        {expedicao.status !== 'EXPEDIDA' && expedicao.status !== 'CANCELADA' && (
          <button
            disabled={workflow.submitting}
            onClick={async () => {
              await workflow.cancelar(expedicao.id);
              reload();
            }}
            className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition-all duration-200"
          >
            Cancelar
          </button>
        )}
      </div>

      {workflow.error && <p className="mt-3 text-sm text-red-600">{workflow.error}</p>}
    </div>
  );
}

function AdicionarItemExpedicaoForm({
  produtos,
  depositanteId,
  onProdutoCriado,
  submitting,
  error,
  onAdicionar,
}: {
  produtos: Array<{ id: string; sku: string; descricao: string }>;
  depositanteId?: string;
  onProdutoCriado?: () => unknown;
  submitting: boolean;
  error: string | null;
  onAdicionar: (input: { produto_id: string; quantidade_solicitada: number }) => Promise<void>;
}) {
  const [produtoId, setProdutoId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const novo = useCadastroRapido();

  return (
    <form
      data-testid="adicionar-item-expedicao-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await onAdicionar({ produto_id: produtoId, quantidade_solicitada: Number(quantidade) });
        setProdutoId('');
        setQuantidade('');
      }}
      className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-dashed border-slate-300 p-4 sm:grid-cols-3"
    >
      <select
        required
        aria-label="Produto"
        className="input"
        value={produtoId}
        onChange={novo.aoMudar('produto', setProdutoId, onProdutoCriado, {
          depositante_id: depositanteId,
        })}
        data-testid="novo-item-expedicao-produto"
      >
        <option value="">Produto...</option>
        {produtos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.sku} — {p.descricao}
          </option>
        ))}
        <OpcaoAdicionarNovo />
      </select>
      <input
        required
        type="number"
        min={0.001}
        step="0.001"
        placeholder="Quantidade"
        aria-label="Quantidade solicitada"
        className="input"
        value={quantidade}
        onChange={(e) => setQuantidade(e.target.value)}
        data-testid="novo-item-expedicao-quantidade"
      />
      <button
        type="submit"
        disabled={submitting}
        className="flex items-center justify-center gap-1 rounded-xl bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
        data-testid="adicionar-item-expedicao-btn"
      >
        <Plus className="h-4 w-4" /> {submitting ? 'Adicionando...' : 'Adicionar item'}
      </button>
      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
      {novo.modal}
    </form>
  );
}

function ItemSeparacao({
  item,
  produtoRotulo,
  enderecos,
  armazemId,
  onEnderecoCriado,
  editavel,
  podeSeparar,
  onSeparar,
  onFlag,
  onAtualizar,
  onRemover,
}: {
  item: {
    id: string;
    produto_id: string;
    quantidade_solicitada: number;
    quantidade_separada?: number | null;
    reembalado?: boolean;
    etiquetado?: boolean;
  };
  produtoRotulo: string;
  enderecos: Array<{ id: string; area: string; rua: string; prateleira: string; posicao: string }>;
  armazemId?: string;
  onEnderecoCriado?: () => unknown;
  editavel: boolean;
  podeSeparar: boolean;
  onSeparar: (input: { quantidade_separada: number; endereco_id: string }) => Promise<void>;
  onFlag: (flags: { reembalado?: boolean; etiquetado?: boolean }) => Promise<void>;
  onAtualizar: (input: { quantidade_solicitada: number }) => Promise<void>;
  onRemover: () => Promise<void>;
}) {
  const [quantidade, setQuantidade] = useState(String(item.quantidade_solicitada));
  const [enderecoId, setEnderecoId] = useState('');
  const novo = useCadastroRapido();
  const jaSeparado = item.quantidade_separada != null;
  const alterado = Number(quantidade) !== item.quantidade_solicitada;

  return (
    <div className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm" data-testid="expedicao-item">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">{produtoRotulo}</p>
        {editavel && !jaSeparado && (
          <button
            type="button"
            data-testid="remover-item-expedicao"
            onClick={() => void onRemover()}
            className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 transition-all duration-200"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </button>
        )}
      </div>
      <p className="mb-2 text-sm text-slate-600">
        Solicitado: <span className="font-medium text-slate-900">{item.quantidade_solicitada}</span>
        {jaSeparado && (
          <span className="ml-2 text-emerald-600">separado: {item.quantidade_separada}</span>
        )}
      </p>

      {!jaSeparado && editavel && (
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            min={0}
            step="0.001"
            aria-label="Quantidade solicitada"
            className="input w-28"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
          />
          <button
            type="button"
            data-testid="salvar-item-expedicao"
            disabled={!alterado || Number(quantidade) <= 0}
            onClick={() => onAtualizar({ quantidade_solicitada: Number(quantidade) })}
            className="flex items-center gap-1 rounded-xl bg-rigabras-500 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
          >
            <Pencil className="h-4 w-4" /> Salvar
          </button>
        </div>
      )}

      {!jaSeparado && !editavel && (
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            min={0}
            step="0.001"
            className="input w-28"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            disabled={!podeSeparar}
          />
          <select
            className="input"
            value={enderecoId}
            onChange={novo.aoMudar('endereco', setEnderecoId, onEnderecoCriado, {
              armazem_id: armazemId,
            })}
            disabled={!podeSeparar}
          >
            <option value="">Endereço...</option>
            {enderecos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.area}-{e.rua}-{e.prateleira}-{e.posicao}
              </option>
            ))}
            <OpcaoAdicionarNovo rotulo="+ Novo endereço..." />
          </select>
          <button
            disabled={!podeSeparar || !enderecoId}
            onClick={() =>
              onSeparar({ quantidade_separada: Number(quantidade), endereco_id: enderecoId })
            }
            className="rounded-xl bg-rigabras-500 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
          >
            Separar
          </button>
        </div>
      )}

      {jaSeparado && (
        <div className="flex gap-2 text-sm">
          <label className="flex items-center gap-1 text-slate-600">
            <input
              type="checkbox"
              checked={item.reembalado ?? false}
              onChange={(e) => onFlag({ reembalado: e.target.checked })}
            />
            Reembalado
          </label>
          <label className="flex items-center gap-1 text-slate-600">
            <input
              type="checkbox"
              checked={item.etiquetado ?? false}
              onChange={(e) => onFlag({ etiquetado: e.target.checked })}
            />
            Etiquetado
          </label>
        </div>
      )}
      {novo.modal}
    </div>
  );
}
