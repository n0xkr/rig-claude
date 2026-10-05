import { useState } from 'react';
import { Plus, RefreshCw, Share2, Trash2 } from 'lucide-react';
import type {
  CondicaoUsoRede,
  CreateRedeInput,
  Rede,
  StatusRede,
} from '@rigabras/shared';
import {
  useCreateRede,
  useDeleteRede,
  useMovimentarRede,
  useRedesKpis,
  useRedesList,
} from '../hooks/useRedes.js';
import { useVeiculosList } from '../hooks/useVeiculos.js';
import { formatDateOnly } from '../lib/dateOnly.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';
import { RedeCondicaoBadge, RedeStatusBadge } from '../components/StatusBadge.js';
import { WmsSubNav } from '../components/WmsSubNav.js';

const CONDICOES: CondicaoUsoRede[] = ['NOVA', 'BOA', 'REGULAR', 'RUIM'];
const STATUS: Array<{ valor: StatusRede | ''; rotulo: string }> = [
  { valor: '', rotulo: 'Todos os status' },
  { valor: 'DISPONIVEL', rotulo: 'Disponíveis' },
  { valor: 'EM_TRANSITO', rotulo: 'Em trânsito' },
];

const KPI_CARDS: Array<{ chave: 'total' | 'disponiveis' | 'em_transito' | 'vencendo' | 'vencidas' | 'padrao_cliente'; rotulo: string }> = [
  { chave: 'total', rotulo: 'Total' },
  { chave: 'disponiveis', rotulo: 'Disponíveis' },
  { chave: 'em_transito', rotulo: 'Em trânsito' },
  { chave: 'vencendo', rotulo: 'Vencendo (30d)' },
  { chave: 'vencidas', rotulo: 'Vencidas' },
  { chave: 'padrao_cliente', rotulo: 'Padrão cliente' },
];

/** Painel exclusivo das redes transportadas pela frota (Módulo 5 — WMS). */
export default function RedesListPage() {
  const [filtro, setFiltro] = useState<{ status: string; condicao: string; q: string }>({
    status: '',
    condicao: '',
    q: '',
  });
  const { state, redes, error, reload } = useRedesList(filtro);
  const { kpis } = useRedesKpis();
  const { veiculos } = useVeiculosList();
  const { remove } = useDeleteRede();
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const placaDe = (veiculoId: string | null | undefined): string | null =>
    veiculos.find((v) => v.id === veiculoId)?.placa ?? veiculoId ?? null;

  async function excluir(rede: Rede) {
    setFeedback(null);
    const ok = await remove(rede.id);
    if (ok) reload();
    else setFeedback('Não foi possível excluir a rede (está em trânsito?).');
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <WmsSubNav />
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Share2 className="h-6 w-6 text-rigabras-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Redes dos veículos</h1>
            <p className="text-sm text-slate-500">
              Cadastro, condição, validade e relatório em tempo real das redes.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={reload}
            title="Atualizar relatório"
            data-testid="atualizar-redes"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:text-slate-900 transition-all duration-200"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            data-testid="nova-rede"
            className="flex items-center gap-2 rounded-xl bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-all duration-200"
          >
            <Plus className="h-4 w-4" /> Nova rede
          </button>
        </div>
      </div>

      <div
        data-testid="kpis-redes"
        className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
      >
        {KPI_CARDS.map(({ chave, rotulo }) => (
          <div
            key={chave}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {rotulo}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900" data-testid={`kpi-${chave}`}>
              {kpis ? kpis[chave] : '—'}
            </p>
          </div>
        ))}
      </div>

      {showForm && (
        <RedeForm
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="search"
          placeholder="Buscar por código..."
          className="input max-w-xs"
          value={filtro.q}
          onChange={(e) => setFiltro((f) => ({ ...f, q: e.target.value }))}
          data-testid="buscar-redes"
        />
        <select
          className="input"
          value={filtro.status}
          onChange={(e) => setFiltro((f) => ({ ...f, status: e.target.value }))}
          data-testid="filtro-status-rede"
        >
          {STATUS.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.rotulo}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={filtro.condicao}
          onChange={(e) => setFiltro((f) => ({ ...f, condicao: e.target.value }))}
          data-testid="filtro-condicao-rede"
        >
          <option value="">Todas as condições</option>
          {CONDICOES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {feedback && (
        <p className="mb-3 text-sm text-amber-700" data-testid="rede-feedback">
          {feedback}
        </p>
      )}

      {state === 'loading' && <LoadingSkeleton />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro desconhecido'} onRetry={reload} />}
      {state === 'success' && redes.length === 0 && (
        <EmptyState
          title="Nenhuma rede cadastrada"
          description="Cadastre a primeira rede para começar o painel."
        />
      )}
      {state === 'success' && redes.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
          {redes.map((r) => (
            <li
              key={r.id}
              data-testid={`rede-linha-${r.codigo}`}
              className="px-4 py-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-900">
                    {r.codigo}
                  </span>
                  <RedeCondicaoBadge condicao={r.condicao_uso} />
                  <RedeStatusBadge status={r.status} />
                  {r.padrao_cliente && (
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                      Padrão cliente
                    </span>
                  )}
                  {r.status === 'EM_TRANSITO' && r.veiculo_id && (
                    <span className="text-xs text-slate-500">
                      veículo {placaDe(r.veiculo_id)}
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    {r.validade
                      ? `validade ${formatDateOnly(r.validade)}${validadeAlerta(r.validade)}`
                      : 'sem validade'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MovimentarRedeForm rede={r} onDone={reload} placa={placaDe(r.veiculo_id)} />
                  <button
                    onClick={() => void excluir(r)}
                    disabled={r.status === 'EM_TRANSITO'}
                    title={
                      r.status === 'EM_TRANSITO'
                        ? 'Rede em trânsito não pode ser excluída'
                        : 'Excluir rede'
                    }
                    data-testid={`excluir-rede-${r.codigo}`}
                    className="rounded-xl border border-slate-200 p-2 text-slate-400 shadow-sm hover:text-red-600 disabled:opacity-40 transition-all duration-200"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {r.observacoes && (
                <p className="mt-1 text-sm text-slate-500">{r.observacoes}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function validadeAlerta(validade: string): string {
  const alvo = Date.parse(`${validade.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(alvo)) return '';
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((alvo - hoje.getTime()) / 86_400_000);
  if (dias < 0) return ' · vencida';
  if (dias <= 30) return ` · vence em ${dias}d`;
  return '';
}

function RedeForm({ onCreated }: { onCreated: () => void }) {
  const { create, submitting, error } = useCreateRede();
  const [form, setForm] = useState<CreateRedeInput>({
    condicao_uso: 'BOA',
    validade: null,
    padrao_cliente: false,
    observacoes: null,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await create(form);
    onCreated();
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="rede-form"
      className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-4"
    >
      <select
        className="input"
        value={form.condicao_uso}
        onChange={(e) =>
          setForm((f) => ({ ...f, condicao_uso: e.target.value as CondicaoUsoRede }))
        }
        data-testid="rede-condicao"
      >
        {CONDICOES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input
        type="date"
        className="input"
        value={form.validade ?? ''}
        onChange={(e) => setForm((f) => ({ ...f, validade: e.target.value || null }))}
        data-testid="rede-validade"
      />
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.padrao_cliente}
          onChange={(e) => setForm((f) => ({ ...f, padrao_cliente: e.target.checked }))}
          data-testid="rede-padrao-cliente"
        />
        Padrão cliente
      </label>
      <input
        placeholder="Observações (opcional)"
        className="input"
        value={form.observacoes ?? ''}
        onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value || null }))}
      />
      <button
        type="submit"
        disabled={submitting}
        data-testid="salvar-rede"
        className="col-span-2 rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200 sm:col-span-4"
      >
        {submitting ? 'Salvando...' : 'Cadastrar rede'}
      </button>
      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
    </form>
  );
}

function MovimentarRedeForm({
  rede,
  onDone,
  placa,
}: {
  rede: Rede;
  onDone: () => void;
  placa: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const { movimentar, submitting, error } = useMovimentarRede();
  const { veiculos } = useVeiculosList();
  const retirada = rede.status === 'DISPONIVEL';
  const [cliente, setCliente] = useState('');
  const [veiculoId, setVeiculoId] = useState('');

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        data-testid={`movimentar-rede-${rede.codigo}`}
        className={`rounded-xl px-3 py-2 text-sm font-medium text-white transition-all duration-200 ${
          retirada ? 'bg-rigabras-500 hover:opacity-90' : 'bg-slate-500 hover:opacity-90'
        }`}
      >
        {retirada ? 'Retirar' : `Devolver${placa ? ` (${placa})` : ''}`}
      </button>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await movimentar(rede.id, {
      rede_id: rede.id,
      tipo: retirada ? 'RETIRADA' : 'DEVOLUCAO',
      veiculo_id: retirada ? veiculoId : undefined,
      cliente,
      motorista_id: null,
      observacoes: null,
    });
    setAberto(false);
    setCliente('');
    setVeiculoId('');
    onDone();
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid={`rede-movimentacao-${rede.codigo}`}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm"
    >
      <span className="px-1 text-sm font-medium text-slate-700">
        {retirada ? 'Retirada' : 'Devolução'} {rede.codigo}
      </span>
      <input
        required
        placeholder="Cliente"
        className="input max-w-[10rem]"
        value={cliente}
        onChange={(e) => setCliente(e.target.value)}
        data-testid={`mov-cliente-${rede.codigo}`}
      />
      {retirada && (
        <select
          required
          className="input max-w-[10rem]"
          value={veiculoId}
          onChange={(e) => setVeiculoId(e.target.value)}
          data-testid={`mov-veiculo-${rede.codigo}`}
        >
          <option value="">Veículo...</option>
          {veiculos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.placa} — {v.modelo ?? v.id}
            </option>
          ))}
        </select>
      )}
      <button
        type="submit"
        disabled={submitting}
        data-testid={`confirmar-mov-${rede.codigo}`}
        className="rounded-xl bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
      >
        {submitting ? 'Salvando...' : 'Confirmar'}
      </button>
      <button
        type="button"
        onClick={() => setAberto(false)}
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 transition-all duration-200"
      >
        Cancelar
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
