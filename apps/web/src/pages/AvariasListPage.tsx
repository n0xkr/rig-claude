import { useState } from 'react';
import { AlertOctagon, Plus, WifiOff } from 'lucide-react';
import type { SeveridadeAvaria } from '@rigabras/shared';
import { useAvariasList, useCreateAvaria } from '../hooks/useAvarias.js';
import { useProdutosList } from '../hooks/useProdutosArmazenados.js';
import { useEnderecosList, useArmazensList } from '../hooks/useEnderecosArmazem.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';
import { AvariaSeveridadeBadge } from '../components/StatusBadge.js';
import { OpcaoAdicionarNovo, useCadastroRapido } from '../components/CadastroRapido.js';
import { WmsSubNav } from '../components/WmsSubNav.js';

const SEVERIDADES: SeveridadeAvaria[] = ['LEVE', 'MODERADA', 'GRAVE', 'PERDA_TOTAL'];

/** Controle de avarias (Módulo 5, WMS, critério #5): lista + registro de novas avarias. */
export default function AvariasListPage() {
  const { state, avarias, error, reload } = useAvariasList();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <WmsSubNav />
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertOctagon className="h-6 w-6 text-red-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Avarias</h1>
            <p className="text-sm text-slate-500">Registro de avarias de mercadoria no armazém.</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-all duration-200"
        >
          <Plus className="h-4 w-4" /> Nova avaria
        </button>
      </div>

      {showForm && (
        <AvariaForm
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      {state === 'loading' && <LoadingSkeleton />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro desconhecido'} onRetry={reload} />}
      {state === 'success' && avarias.length === 0 && (
        <EmptyState title="Nenhuma avaria registrada" description="Nenhuma avaria até o momento." />
      )}
      {state === 'success' && avarias.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
          {avarias.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 px-4 py-4">
              <div>
                <p className="font-medium text-slate-900">{a.descricao}</p>
                <p className="text-sm text-slate-500">
                  quantidade: {a.quantidade} ·{' '}
                  {a.created_at && new Date(a.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
              <AvariaSeveridadeBadge severidade={a.severidade} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AvariaForm({ onCreated }: { onCreated: () => void }) {
  const { create, submitting, error } = useCreateAvaria();
  const { produtos, reload: reloadProdutos } = useProdutosList();
  const { armazens } = useArmazensList();
  const { enderecos, reload: reloadEnderecos } = useEnderecosList(armazens[0]?.id);
  const novo = useCadastroRapido();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState({
    produto_id: '',
    endereco_id: '',
    severidade: 'LEVE' as SeveridadeAvaria,
    quantidade: '',
    descricao: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const { queued } = await create({
      produto_id: form.produto_id,
      endereco_id: form.endereco_id || undefined,
      severidade: form.severidade,
      quantidade: Number(form.quantidade),
      descricao: form.descricao,
    });
    if (queued) {
      setFeedback('Sem conexão: avaria salva localmente e será sincronizada automaticamente.');
      return;
    }
    onCreated();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 p-6 sm:grid-cols-3 bg-white shadow-sm"
    >
      <select
        required
        className="input"
        value={form.produto_id}
        onChange={novo.aoMudar('produto', (id) => setForm((f) => ({ ...f, produto_id: id })), reloadProdutos)}
      >
        <option value="">Produto...</option>
        {produtos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.sku} — {p.descricao}
          </option>
        ))}
        <OpcaoAdicionarNovo />
      </select>
      <select
        className="input"
        value={form.endereco_id}
        onChange={novo.aoMudar('endereco', (id) => setForm((f) => ({ ...f, endereco_id: id })), reloadEnderecos, {
          armazem_id: armazens[0]?.id,
        })}
      >
        <option value="">Endereço (opcional)...</option>
        {enderecos.map((en) => (
          <option key={en.id} value={en.id}>
            {en.area}-{en.rua}-{en.prateleira}-{en.posicao}
          </option>
        ))}
        <OpcaoAdicionarNovo />
      </select>
      <select
        className="input"
        value={form.severidade}
        onChange={(e) => setForm((f) => ({ ...f, severidade: e.target.value as SeveridadeAvaria }))}
      >
        {SEVERIDADES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <input
        required
        type="number"
        min={0.001}
        step="0.001"
        placeholder="Quantidade"
        className="input"
        value={form.quantidade}
        onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))}
      />
      <input
        required
        placeholder="Descrição"
        className="input col-span-2 sm:col-span-2"
        value={form.descricao}
        onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
      />
      <button
        type="submit"
        disabled={submitting}
        className="col-span-2 rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 sm:col-span-3 transition-all duration-200"
      >
        {submitting ? 'Salvando...' : 'Registrar avaria'}
      </button>
      {feedback && (
        <p className="col-span-full flex items-center gap-2 text-sm text-amber-700">
          <WifiOff className="h-4 w-4 shrink-0" /> {feedback}
        </p>
      )}
      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
      {novo.modal}
    </form>
  );
}
