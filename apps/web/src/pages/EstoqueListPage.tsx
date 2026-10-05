import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Boxes, Plus, Search } from 'lucide-react';
import type { ProdutoArmazenado, SaldoEstoque, TipoMovimentacaoEstoque } from '@rigabras/shared';
import {
  useSaldosEstoque,
  useMovimentarEstoque,
  useMovimentacoesEstoque,
} from '../hooks/useEstoque.js';
import { useArmazensList, useEnderecosList } from '../hooks/useEnderecosArmazem.js';
import { useProdutosList } from '../hooks/useProdutosArmazenados.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';

type TipoMovimentacao = 'ENDERECAMENTO' | 'SEPARACAO' | 'TRANSFERENCIA';

interface MovimentoLinha {
  modo: 'linha';
  tipo: TipoMovimentacao;
  saldo: SaldoEstoque;
}

interface MovimentoAvulso {
  modo: 'avulso';
}

type Movimento = MovimentoLinha | MovimentoAvulso;

const ROTULO_TIPO: Record<TipoMovimentacao, string> = {
  ENDERECAMENTO: 'Entrada',
  SEPARACAO: 'Saída',
  TRANSFERENCIA: 'Transferência',
};

/** Saldos por endereço + lançamentos manuais de entrada/saída (Módulo 5, WMS). */
export default function EstoqueListPage() {
  const { armazens } = useArmazensList();
  const [armazemId, setArmazemId] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('');
  const [movimento, setMovimento] = useState<Movimento | null>(null);
  const { state, saldos, error, reload } = useSaldosEstoque({ armazemId, q: filtro });
  const historico = useMovimentacoesEstoque();
  const { produtos } = useProdutosList();

  useEffect(() => {
    if (!armazemId && armazens.length > 0) setArmazemId(armazens[0]!.id);
  }, [armazens, armazemId]);

  useEffect(() => {
    const t = setTimeout(() => setFiltro(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Boxes className="h-6 w-6 text-rigabras-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Estoque</h1>
            <p className="text-sm text-slate-500">
              Saldo por endereço e movimentações manuais (entrada/saída).
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Buscar produto</span>
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="input pl-8"
              placeholder="Buscar SKU, descrição ou depositante"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              data-testid="estoque-busca"
            />
          </label>
          {armazens.length > 1 && (
            <select
              aria-label="Filtrar por armazém"
              className="input"
              value={armazemId}
              onChange={(e) => setArmazemId(e.target.value)}
              data-testid="estoque-armazem-select"
            >
              {armazens.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setMovimento({ modo: 'avulso' })}
            className="flex items-center gap-2 rounded-xl bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-all duration-200"
            data-testid="nova-movimentacao"
          >
            <Plus className="h-4 w-4" /> Nova movimentação
          </button>
          <Link
            to="/wms"
            className="text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
          >
            WMS
          </Link>
        </div>
      </div>

      {movimento && (
        <MovimentacaoForm
          modo={movimento.modo}
          tipoInicial={movimento.modo === 'linha' ? movimento.tipo : 'ENDERECAMENTO'}
          saldo={movimento.modo === 'linha' ? movimento.saldo : undefined}
          produtos={produtos}
          armazemId={armazemId}
          onConcluido={() => {
            setMovimento(null);
            reload();
            historico.reload();
          }}
          onCancelar={() => setMovimento(null)}
        />
      )}

      {state === 'loading' && <LoadingSkeleton />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro desconhecido'} onRetry={reload} />}
      {state === 'success' && saldos.length === 0 && (
        <EmptyState
          title="Nenhum saldo de estoque"
          description="Use “Nova movimentação” para dar a primeira entrada, ou conclua a conferência de um recebimento."
        />
      )}

      {state === 'success' && saldos.length > 0 && (
        <div className="mb-8 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Depositante</th>
                <th className="px-4 py-3">Endereço</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3 text-right">Movimentar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {saldos.map((s) => (
                <tr key={`${s.produto_id}-${s.endereco_id}`} data-testid="estoque-linha">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{s.sku}</p>
                    <p className="text-xs text-slate-500">{s.descricao}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.depositante_nome}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.endereco_rotulo}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {s.quantidade}{' '}
                    <span className="text-xs font-normal">{s.unidade_medida ?? 'UN'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        data-testid="entrada-btn"
                        onClick={() => setMovimento({ modo: 'linha', tipo: 'ENDERECAMENTO', saldo: s })}
                        className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-all duration-200"
                      >
                        <ArrowDownToLine className="h-3.5 w-3.5" /> Entrada
                      </button>
                      <button
                        type="button"
                        data-testid="saida-btn"
                        onClick={() => setMovimento({ modo: 'linha', tipo: 'SEPARACAO', saldo: s })}
                        className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-all duration-200"
                      >
                        <ArrowUpFromLine className="h-3.5 w-3.5" /> Saída
                      </button>
                      <button
                        type="button"
                        data-testid="transferencia-btn"
                        onClick={() => setMovimento({ modo: 'linha', tipo: 'TRANSFERENCIA', saldo: s })}
                        className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all duration-200"
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" /> Transferir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-bold text-slate-600">Últimas movimentações</h2>
        {historico.state === 'loading' && <LoadingSkeleton />}
        {historico.state === 'error' && (
          <ErrorCard message={historico.error ?? 'Erro'} onRetry={historico.reload} />
        )}
        {historico.state === 'success' && historico.movimentacoes.length === 0 && (
          <EmptyState
            title="Nenhuma movimentação"
            description="O ledger começa a ser gravado no primeiro lançamento."
          />
        )}
        {historico.state === 'success' && historico.movimentacoes.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm shadow-sm">
            {historico.movimentacoes
              .slice()
              .reverse()
              .map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">{rotuloTipo(m.tipo_movimentacao)}</p>
                    <p className="text-xs text-slate-500">
                      {m.referencia_documento ?? 'sem documento'} ·{' '}
                      {new Date(m.created_at ?? Date.now()).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <span className="font-semibold text-slate-700">
                    {m.tipo_movimentacao === 'SEPARACAO' ||
                    m.tipo_movimentacao === 'EXPEDICAO' ||
                    m.tipo_movimentacao === 'CROSS_DOCKING' ||
                    m.tipo_movimentacao === 'AVARIA'
                      ? '−'
                      : '+'}
                    {m.quantidade}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function rotuloTipo(tipo: TipoMovimentacaoEstoque): string {
  const rotulos: Record<string, string> = {
    RECEBIMENTO: 'Recebimento (entrada)',
    ENDERECAMENTO: 'Endereçamento (entrada)',
    SEPARACAO: 'Separação (saída)',
    EXPEDICAO: 'Expedição (saída)',
    CROSS_DOCKING: 'Cross-docking (saída)',
    AVARIA: 'Avaria (saída)',
    TRANSFERENCIA: 'Transferência',
    REEMBALAGEM: 'Reembalagem',
    ETIQUETAGEM: 'Etiquetagem',
    AJUSTE_INVENTARIO: 'Ajuste de inventário',
  };
  return rotulos[tipo] ?? tipo;
}

function MovimentacaoForm({
  modo,
  tipoInicial,
  saldo,
  produtos,
  armazemId,
  onConcluido,
  onCancelar,
}: {
  modo: 'linha' | 'avulso';
  tipoInicial: TipoMovimentacao;
  saldo?: SaldoEstoque;
  produtos: ProdutoArmazenado[];
  armazemId: string;
  onConcluido: () => void;
  onCancelar: () => void;
}) {
  const { enderecos } = useEnderecosList(armazemId);
  const { movimentar, submitting, error } = useMovimentarEstoque();
  const [tipo, setTipo] = useState<TipoMovimentacao>(tipoInicial);
  const [produtoId, setProdutoId] = useState(saldo?.produto_id ?? '');
  const [quantidade, setQuantidade] = useState('');
  const [documento, setDocumento] = useState('');
  const [enderecoOrigem, setEnderecoOrigem] = useState(saldo?.endereco_id ?? '');
  const [enderecoDestino, setEnderecoDestino] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const ehEntrada = tipo === 'ENDERECAMENTO';
  const ehSaida = tipo === 'SEPARACAO';
  const rotuloProduto = saldo
    ? `${saldo.sku} — ${saldo.descricao}`
    : produtoId
      ? (() => {
          const p = produtos.find((x) => x.id === produtoId);
          return p ? `${p.sku} — ${p.descricao}` : '';
        })()
      : '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await movimentar({
      tipo,
      produto_id: produtoId,
      quantidade: Number(quantidade),
      documento,
      endereco_origem_id: ehEntrada ? undefined : enderecoOrigem || saldo?.endereco_id,
      endereco_destino_id: ehSaida ? undefined : enderecoDestino || undefined,
      observacoes: observacoes || null,
    });
    onConcluido();
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="movimentacao-form"
      className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-blue-200 bg-blue-50/50 p-6 sm:grid-cols-4"
    >
      <div className="col-span-full">
        <p className="text-sm font-semibold text-slate-900">
          {ROTULO_TIPO[tipo]} — {rotuloProduto || 'selecione o produto'}
          {saldo && (
            <>
              {' '}
              · saldo atual {saldo.quantidade} {saldo.unidade_medida ?? 'UN'} · endereço{' '}
              {saldo.endereco_rotulo}
            </>
          )}
        </p>
      </div>

      {modo === 'avulso' && (
        <>
          <select
            required
            aria-label="Tipo de movimentação"
            className="input"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoMovimentacao)}
            data-testid="movimentacao-tipo"
          >
            {(Object.keys(ROTULO_TIPO) as TipoMovimentacao[]).map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO[t]}
              </option>
            ))}
          </select>
          <select
            required
            aria-label="Produto"
            className="input col-span-1"
            value={produtoId}
            onChange={(e) => setProdutoId(e.target.value)}
            data-testid="movimentacao-produto"
          >
            <option value="">Produto...</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.descricao}
              </option>
            ))}
          </select>
        </>
      )}

      <input
        required
        type="number"
        min={0.001}
        step="0.001"
        placeholder={ehSaida ? 'Quantidade (saída)' : 'Quantidade'}
        aria-label="Quantidade"
        className="input"
        value={quantidade}
        onChange={(e) => setQuantidade(e.target.value)}
        data-testid="movimentacao-quantidade"
      />
      <input
        required
        placeholder="Documento (nota/romaneio)"
        aria-label="Documento"
        className="input"
        value={documento}
        onChange={(e) => setDocumento(e.target.value)}
        data-testid="movimentacao-documento"
      />

      {!ehEntrada && (
        <select
          required
          aria-label="Endereço de origem"
          className="input"
          value={enderecoOrigem}
          onChange={(e) => setEnderecoOrigem(e.target.value)}
          data-testid="movimentacao-origem"
        >
          <option value="">Origem...</option>
          {enderecos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.area}-{e.rua}-{e.prateleira}-{e.posicao}
            </option>
          ))}
        </select>
      )}

      {!ehSaida && (
        <select
          required
          aria-label="Endereço de destino"
          className="input"
          value={enderecoDestino}
          onChange={(e) => setEnderecoDestino(e.target.value)}
          data-testid="movimentacao-destino"
        >
          <option value="">Destino...</option>
          {enderecos
            .filter((e) => e.id !== (enderecoOrigem || saldo?.endereco_id))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.area}-{e.rua}-{e.prateleira}-{e.posicao}
              </option>
            ))}
        </select>
      )}

      <input
        placeholder="Observações"
        aria-label="Observações"
        className="input"
        value={observacoes}
        onChange={(e) => setObservacoes(e.target.value)}
      />

      <div className="col-span-full flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
          data-testid="lancar-movimentacao"
        >
          {submitting ? 'Lançando...' : 'Lançar movimentação'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all duration-200"
        >
          Cancelar
        </button>
        {error && <p className="self-center text-sm text-red-600">{error}</p>}
      </div>
    </form>
  );
}
