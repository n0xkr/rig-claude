import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Package, Plus, ArrowLeft, Pencil } from 'lucide-react';
import type { ProdutoArmazenado } from '@rigabras/shared';
import {
  useProdutosList,
  useCreateProduto,
  useUpdateProduto,
} from '../hooks/useProdutosArmazenados.js';
import { useDepositantesList } from '../hooks/useDepositantes.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';
import { OpcaoAdicionarNovo, useCadastroRapido } from '../components/CadastroRapido.js';

/** Catálogo de produtos armazenados por depositante (Módulo 5, WMS — SKU). */
export default function ProdutosListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const depositanteId = searchParams.get('depositanteId') ?? undefined;
  const { state, produtos, error, reload } = useProdutosList(depositanteId);
  const { depositantes, reload: reloadDepositantes } = useDepositantesList();
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<ProdutoArmazenado | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to="/wms/depositantes"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
      >
        <ArrowLeft className="h-4 w-4" /> Depositantes
      </Link>
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6 text-rigabras-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Produtos armazenados</h1>
            <p className="text-sm text-slate-500">Catálogo de SKUs por depositante.</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-all duration-200"
        >
          <Plus className="h-4 w-4" /> Novo produto
        </button>
      </div>

      <div className="mb-4">
        <select
          aria-label="Filtrar por depositante"
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

      {editando && (
        <ProdutoEditForm
          produto={editando}
          onSalvo={() => {
            setEditando(null);
            reload();
          }}
          onCancelar={() => setEditando(null)}
        />
      )}

      {showForm && (
        <ProdutoForm
          depositantes={depositantes}
          defaultDepositanteId={depositanteId}
          recarregarDepositantes={reloadDepositantes}
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
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
          {produtos.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-4">
              <div>
                <p className="font-medium text-slate-900">
                  {p.sku} — {p.descricao}
                </p>
                <p className="text-sm text-slate-500">
                  {p.unidade_medida ?? 'UN'}
                  {p.peso_kg != null && ` · ${p.peso_kg} kg`}
                  {p.volume_m3 != null && ` · ${p.volume_m3} m³`}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    p.ativo === false
                      ? 'bg-slate-100 text-slate-500'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {p.ativo === false ? 'Inativo' : 'Ativo'}
                </span>
                <button
                  type="button"
                  data-testid={`editar-produto-${p.sku}`}
                  onClick={() => setEditando(p)}
                  className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
                >
                  <Pencil className="h-4 w-4" /> Editar
                </button>
                <Link
                  to={`/wms/produtos/${p.id}/rastreio`}
                  className="text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
                >
                  Rastreio
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProdutoEditForm({
  produto,
  onSalvo,
  onCancelar,
}: {
  produto: ProdutoArmazenado;
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const { update, submitting, error } = useUpdateProduto();
  const [form, setForm] = useState({
    sku: produto.sku,
    descricao: produto.descricao,
    unidade_medida: produto.unidade_medida ?? 'UN',
    peso_kg: produto.peso_kg != null ? String(produto.peso_kg) : '',
    volume_m3: produto.volume_m3 != null ? String(produto.volume_m3) : '',
    ativo: produto.ativo !== false,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await update(produto.id, {
      sku: form.sku,
      descricao: form.descricao,
      unidade_medida: form.unidade_medida,
      peso_kg: form.peso_kg ? Number(form.peso_kg) : undefined,
      volume_m3: form.volume_m3 ? Number(form.volume_m3) : undefined,
      ativo: form.ativo,
    });
    onSalvo();
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="produto-edit-form"
      className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-blue-200 bg-blue-50/50 p-6 sm:grid-cols-5"
    >
      <p className="col-span-full text-sm font-semibold text-slate-900">
        Editando {produto.sku}
      </p>
      <input
        required
        placeholder="SKU"
        aria-label="SKU"
        className="input"
        value={form.sku}
        onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
      />
      <input
        required
        placeholder="Descrição"
        aria-label="Descrição"
        className="input col-span-2 sm:col-span-2"
        value={form.descricao}
        onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
      />
      <input
        placeholder="Unidade"
        aria-label="Unidade"
        className="input"
        value={form.unidade_medida}
        onChange={(e) => setForm((f) => ({ ...f, unidade_medida: e.target.value }))}
      />
      <input
        placeholder="Peso (kg)"
        aria-label="Peso (kg)"
        type="number"
        min={0}
        step="0.01"
        className="input"
        value={form.peso_kg}
        onChange={(e) => setForm((f) => ({ ...f, peso_kg: e.target.value }))}
      />
      <input
        placeholder="Volume (m³)"
        aria-label="Volume (m³)"
        type="number"
        min={0}
        step="0.001"
        className="input"
        value={form.volume_m3}
        onChange={(e) => setForm((f) => ({ ...f, volume_m3: e.target.value }))}
      />
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={form.ativo}
          onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
        />
        Ativo
      </label>
      <div className="col-span-2 flex gap-2 sm:col-span-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
        >
          {submitting ? 'Salvando...' : 'Salvar alterações'}
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

function ProdutoForm({
  depositantes,
  defaultDepositanteId,
  onCreated,
  recarregarDepositantes,
}: {
  depositantes: Array<{ id: string; razao_social: string }>;
  defaultDepositanteId?: string;
  onCreated: () => void;
  recarregarDepositantes?: () => unknown;
}) {
  const { create, submitting, error } = useCreateProduto();
  const novo = useCadastroRapido();
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
      className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 p-6 sm:grid-cols-4 bg-white shadow-sm"
    >
      <select
        required
        aria-label="Depositante"
        className="input col-span-2 sm:col-span-1"
        value={form.depositante_id}
        onChange={novo.aoMudar(
          'depositante',
          (id) => setForm((f) => ({ ...f, depositante_id: id })),
          recarregarDepositantes,
        )}
      >
        <option value="">Depositante...</option>
        {depositantes.map((d) => (
          <option key={d.id} value={d.id}>
            {d.razao_social}
          </option>
        ))}
        <OpcaoAdicionarNovo />
      </select>
      {novo.modal}
      <input
        required
        placeholder="SKU"
        aria-label="SKU"
        className="input"
        value={form.sku}
        onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
      />
      <input
        required
        placeholder="Descrição"
        aria-label="Descrição"
        className="input col-span-2 sm:col-span-1"
        value={form.descricao}
        onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
      />
      <input
        placeholder="Peso (kg)"
        aria-label="Peso (kg)"
        type="number"
        min={0}
        step="0.01"
        className="input"
        value={form.peso_kg}
        onChange={(e) => setForm((f) => ({ ...f, peso_kg: e.target.value }))}
      />
      <input
        placeholder="Volume (m³)"
        aria-label="Volume (m³)"
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
        className="col-span-2 rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 sm:col-span-4 transition-all duration-200"
      >
        {submitting ? 'Salvando...' : 'Salvar produto'}
      </button>
      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
