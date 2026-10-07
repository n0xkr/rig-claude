import { useState } from 'react';
import { useEffect } from 'react';
import { Warehouse, Plus } from 'lucide-react';
import type { CreateEnderecoArmazemInput } from '@rigabras/shared';
import {
  useArmazensList,
  useEnderecosList,
  useCreateEndereco,
} from '../hooks/useEnderecosArmazem.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';
import { EnderecoStatusBadge } from '../components/StatusBadge.js';
import { OpcaoAdicionarNovo, useCadastroRapido } from '../components/CadastroRapido.js';
import { WmsSubNav } from '../components/WmsSubNav.js';

/**
 * Mapa de ocupação do armazém (Módulo 5, WMS, critério #6 — "ocupação do
 * armazém"): área -> rua -> prateleira -> posição, com status
 * LIVRE/OCUPADO/BLOQUEADO por endereço (bin).
 */
export default function ArmazemMapaPage() {
  const { armazens, reload: reloadArmazens } = useArmazensList();
  const [armazemId, setArmazemId] = useState<string | undefined>(undefined);
  const novo = useCadastroRapido();
  const novoArmazem = () =>
    novo.abrir('armazem', (r) => {
      void reloadArmazens().then(() => setArmazemId(r.id));
    });
  useEffect(() => {
    if (!armazemId && armazens.length > 0) setArmazemId(armazens[0]!.id);
  }, [armazens, armazemId]);
  const { state, enderecos, error, reload } = useEnderecosList(armazemId);
  const [showForm, setShowForm] = useState(false);

  const ocupados = enderecos.filter((e) => e.status === 'OCUPADO').length;
  const porArea = new Map<string, typeof enderecos>();
  for (const e of enderecos) {
    porArea.set(e.area, [...(porArea.get(e.area) ?? []), e]);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <WmsSubNav />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Warehouse className="h-6 w-6 text-rigabras-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Mapa do armazém</h1>
            <p className="text-sm text-slate-500">
              Ocupação por área/rua/prateleira/posição — armazém coberto de 5.500 m².
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {armazens.length > 0 && (
            <select
              className="input"
              data-testid="armazem-select"
              value={armazemId ?? ''}
              onChange={novo.aoMudar('armazem', (id) => setArmazemId(id || undefined), reloadArmazens)}
            >
              {armazens.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
              <OpcaoAdicionarNovo rotulo="+ Novo armazém..." />
            </select>
          )}
          {armazens.length === 0 ? (
            <button
              onClick={novoArmazem}
              className="flex items-center gap-2 rounded-xl bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-all duration-200"
              data-testid="novo-armazem"
            >
              <Plus className="h-4 w-4" /> Novo armazém
            </button>
          ) : (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-2 rounded-xl bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-all duration-200"
            >
              <Plus className="h-4 w-4" /> Novo endereço
            </button>
          )}
        </div>
      </div>

      {enderecos.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Kpi label="Total de endereços" value={enderecos.length} />
          <Kpi label="Ocupados" value={ocupados} />
          <Kpi label="% ocupação" value={`${Math.round((ocupados / enderecos.length) * 100)}%`} />
        </div>
      )}

      {armazens.length === 0 && (
        <div className="space-y-3 text-center">
          <EmptyState
            title="Nenhum armazém cadastrado"
            description="Cadastre o armazém para poder criar endereços e operar o WMS."
          />
          <button
            onClick={novoArmazem}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Cadastrar armazém
          </button>
        </div>
      )}
      {novo.modal}

      {showForm && armazemId && (
        <EnderecoForm
          armazemId={armazemId}
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      {state === 'loading' && <LoadingSkeleton />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro desconhecido'} onRetry={reload} />}
      {state === 'success' && enderecos.length === 0 && (
        <EmptyState
          title="Nenhum endereço cadastrado"
          description="Cadastre o primeiro endereço (bin) deste armazém."
        />
      )}

      {state === 'success' &&
        Array.from(porArea.entries()).map(([area, itens]) => (
          <section key={area} className="mb-6">
            <h2 className="mb-2 text-sm font-bold text-slate-600">Área {area}</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {itens.map((e) => (
                <div
                  key={e.id}
                  className="rounded-xl border border-slate-200 p-3 text-center text-xs text-slate-600 bg-white shadow-sm"
                >
                  <p className="font-medium">
                    {e.rua}-{e.prateleira}-{e.posicao}
                  </p>
                  <div className="mt-1">
                    <EnderecoStatusBadge status={e.status ?? 'LIVRE'} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-bold text-slate-900">{value}</dd>
    </div>
  );
}

function EnderecoForm({ armazemId, onCreated }: { armazemId: string; onCreated: () => void }) {
  const { create, submitting, error } = useCreateEndereco();
  const [form, setForm] = useState({ area: '', rua: '', prateleira: '', posicao: '' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: CreateEnderecoArmazemInput = { armazem_id: armazemId, ...form };
    try {
      await create(payload);
      onCreated();
    } catch {
      // erro já exposto via `error`
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 p-6 sm:grid-cols-5 bg-white shadow-sm"
    >
      <input
        required
        placeholder="Área"
        className="input"
        value={form.area}
        onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
      />
      <input
        required
        placeholder="Rua"
        className="input"
        value={form.rua}
        onChange={(e) => setForm((f) => ({ ...f, rua: e.target.value }))}
      />
      <input
        required
        placeholder="Prateleira"
        className="input"
        value={form.prateleira}
        onChange={(e) => setForm((f) => ({ ...f, prateleira: e.target.value }))}
      />
      <input
        required
        placeholder="Posição"
        className="input"
        value={form.posicao}
        onChange={(e) => setForm((f) => ({ ...f, posicao: e.target.value }))}
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
      >
        {submitting ? 'Salvando...' : 'Criar'}
      </button>
      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
