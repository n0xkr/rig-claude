import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Package, Plus, ArrowLeft } from 'lucide-react';
import { useProdutosList, useCreateProduto } from '../hooks/useProdutosArmazenados.js';
import { useDepositantesList } from '../hooks/useDepositantes.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';

/** Catálogo de produtos armazenados por depositante (Módulo 5, WMS — SKU). */
export default function ProdutosListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const depositanteId = searchParams.get('depositanteId') ?? undefined;
  const { state, produtos, error, reload } = useProdutosList(depositanteId);
  const { depositantes } = useDepositantesList();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link
        to="/wms/depositantes"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Depositantes
      </Link>
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6 text-rigabras-500" />
          <div>
            <h1 className="text-2xl font-bold text-white">Produtos armazenados</h1>
            <p className="text-sm text-slate-400">Catálogo de SKUs por depositante.</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-md bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
        >
          <Plus className="h-4 w-4" /> Novo produto
        </button>
      </div>

      <div className="mb-4">
        <select
          className="input max-w-xs"
          value={depositanteId ?? ''}
          onChange={(e) => setSearchParams(e.target.value ? { depositanteId: e.target.value } : {})}
        >
          <option value="">Todos os depositantes</option>
          {depositantes.map((d) => (
            <option key={d.id} value={d.id}>
              {d.razao_social}
            </option>
          ))}
        </select>
      </div>

      {showForm && (
        <ProdutoForm
          depositantes={depositantes}
          defaultDepositanteId={depositanteId}
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      {state === 'loading' && <LoadingSkeleton />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro desconhecido'} onRetry={reload} />}
      {state === 'success' && produtos.length === 0 && (
        <EmptyState title="Nenhum produto cadastrado" description="Cadastre o primeiro SKU." />
      )}
      {state === 'success' && produtos.length > 0 && (
        <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
          {produtos.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-4">
              <div>
                <p className="font-medium text-slate-100">
                  {p.sku} — {p.descricao}
                </p>
                <p className="text-sm text-slate-400">
                  {p.unidade_medida ?? 'UN'}
                  {p.peso_kg != null && ` · ${p.peso_kg} kg`}
                  {p.volume_m3 != null && ` · ${p.volume_m3} m³`}
                </p>
              </div>
              <Link
                to={`/wms/produtos/${p.id}/rastreio`}
                className="text-sm text-slate-400 hover:text-white"
              >
                Rastreio
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProdutoForm({
  depositantes,
  defaultDepositanteId,
  onCreated,
}: {
  depositantes: Array<{ id: string; razao_social: string }>;
  defaultDepositanteId?: string;
  onCreated: () => void;
}) {
  const { create, submitting, error } = useCreateProduto();
  const [form, setForm] = useState({
    depositante_id: defaultDepositanteId ?? '',
    sku: '',
    descricao: '',
    unidade_medida: 'UN',
    peso_kg: '',
    volume_m3: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await create({
      depositante_id: form.depositante_id,
      sku: form.sku,
      descricao: form.descricao,
      unidade_medida: form.unidade_medida,
      peso_kg: form.peso_kg ? Number(form.peso_kg) : undefined,
      volume_m3: form.volume_m3 ? Number(form.volume_m3) : undefined,
    });
    onCreated();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-slate-800 p-4 sm:grid-cols-4"
    >
      <select
        required
        className="input col-span-2 sm:col-span-1"
        value={form.depositante_id}
        onChange={(e) => setForm((f) => ({ ...f, depositante_id: e.target.value }))}
      >
        <option value="">Depositante...</option>
        {depositantes.map((d) => (
          <option key={d.id} value={d.id}>
            {d.razao_social}
          </option>
        ))}
      </select>
      <input
        required
        placeholder="SKU"
        className="input"
        value={form.sku}
        onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
      />
      <input
        required
        placeholder="Descrição"
        className="input col-span-2 sm:col-span-1"
        value={form.descricao}
        onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
      />
      <input
        placeholder="Peso (kg)"
        type="number"
        min={0}
        step="0.01"
        className="input"
        value={form.peso_kg}
        onChange={(e) => setForm((f) => ({ ...f, peso_kg: e.target.value }))}
      />
      <input
        placeholder="Volume (m³)"
        type="number"
        min={0}
        step="0.001"
        className="input"
        value={form.volume_m3}
        onChange={(e) => setForm((f) => ({ ...f, volume_m3: e.target.value }))}
      />
      <button
        type="submit"
        disabled={submitting}
        className="col-span-2 rounded-md bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 sm:col-span-4"
      >
        {submitting ? 'Salvando...' : 'Salvar produto'}
      </button>
      {error && <p className="col-span-full text-sm text-red-400">{error}</p>}
    </form>
  );
}
