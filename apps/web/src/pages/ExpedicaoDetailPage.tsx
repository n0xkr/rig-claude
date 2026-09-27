import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Truck } from 'lucide-react';
import { useExpedicaoDetail, useExpedicaoWorkflow } from '../hooks/useExpedicoes.js';
import { useEnderecosList, useArmazensList } from '../hooks/useEnderecosArmazem.js';
import { LoadingSkeleton, ErrorCard } from '../components/StateViews.js';
import { ExpedicaoStatusBadge } from '../components/StatusBadge.js';

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
  const { armazens } = useArmazensList();
  const { enderecos } = useEnderecosList(armazens[0]?.id);

  if (state === 'loading' || state === 'idle') return <LoadingSkeleton />;
  if (state === 'error' || !expedicao)
    return <ErrorCard message={error ?? 'Erro'} onRetry={reload} />;

  const proxima = PROXIMA_ACAO[expedicao.status ?? 'SOLICITADA'];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        to="/wms/expedicoes"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para expedições
      </Link>

      <div className="mb-6 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {expedicao.referencia_documento ?? expedicao.id.slice(0, 8)}
          </h1>
          <p className="text-sm text-slate-400">
            {expedicao.tipo === 'CROSS_DOCKING' ? 'Cross-docking' : 'Normal'}
          </p>
        </div>
        <ExpedicaoStatusBadge status={expedicao.status ?? 'SOLICITADA'} />
      </div>

      {expedicao.viagem_id && (
        <Link
          to={`/viagens/${expedicao.viagem_id}`}
          className="mb-6 flex items-center gap-2 rounded-lg border border-slate-800 p-3 text-sm text-slate-300 hover:bg-slate-900/60"
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
            enderecos={enderecos}
            podeSeparar={expedicao.status === 'SOLICITADA' || expedicao.status === 'EM_SEPARACAO'}
            onSeparar={async (input) => {
              await workflow.separarItem(expedicao.id, item.id, input);
              reload();
            }}
            onFlag={async (flags) => {
              await workflow.marcarReembalagemEtiquetagem(expedicao.id, item.id, flags);
              reload();
            }}
          />
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        {proxima && (
          <button
            disabled={workflow.submitting}
            onClick={async () => {
              await workflow[proxima.acao](expedicao.id);
              reload();
            }}
            className="rounded-md bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
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
            className="rounded-md border border-red-800 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-950/40 disabled:opacity-50"
          >
            Cancelar
          </button>
        )}
      </div>

      {workflow.error && <p className="mt-3 text-sm text-red-400">{workflow.error}</p>}
    </div>
  );
}

function ItemSeparacao({
  item,
  enderecos,
  podeSeparar,
  onSeparar,
  onFlag,
}: {
  item: {
    id: string;
    quantidade_solicitada: number;
    quantidade_separada?: number | null;
    reembalado?: boolean;
    etiquetado?: boolean;
  };
  enderecos: Array<{ id: string; area: string; rua: string; prateleira: string; posicao: string }>;
  podeSeparar: boolean;
  onSeparar: (input: { quantidade_separada: number; endereco_id: string }) => Promise<void>;
  onFlag: (flags: { reembalado?: boolean; etiquetado?: boolean }) => Promise<void>;
}) {
  const [quantidade, setQuantidade] = useState(String(item.quantidade_solicitada));
  const [enderecoId, setEnderecoId] = useState('');
  const jaSeparado = item.quantidade_separada != null;

  return (
    <div className="rounded-lg border border-slate-800 p-4">
      <p className="mb-2 text-sm text-slate-300">
        Solicitado: <span className="font-medium text-slate-100">{item.quantidade_solicitada}</span>
        {jaSeparado && (
          <span className="ml-2 text-emerald-400">separado: {item.quantidade_separada}</span>
        )}
      </p>

      {!jaSeparado && (
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
            onChange={(e) => setEnderecoId(e.target.value)}
            disabled={!podeSeparar}
          >
            <option value="">Endereço...</option>
            {enderecos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.area}-{e.rua}-{e.prateleira}-{e.posicao}
              </option>
            ))}
          </select>
          <button
            disabled={!podeSeparar || !enderecoId}
            onClick={() =>
              onSeparar({ quantidade_separada: Number(quantidade), endereco_id: enderecoId })
            }
            className="rounded-md bg-rigabras-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            Separar
          </button>
        </div>
      )}

      {jaSeparado && (
        <div className="flex gap-2 text-sm">
          <label className="flex items-center gap-1 text-slate-300">
            <input
              type="checkbox"
              checked={item.reembalado ?? false}
              onChange={(e) => onFlag({ reembalado: e.target.checked })}
            />
            Reembalado
          </label>
          <label className="flex items-center gap-1 text-slate-300">
            <input
              type="checkbox"
              checked={item.etiquetado ?? false}
              onChange={(e) => onFlag({ etiquetado: e.target.checked })}
            />
            Etiquetado
          </label>
        </div>
      )}
    </div>
  );
}
