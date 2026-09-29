import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CreateManutencaoVeiculoInput, TipoManutencaoVeiculo } from '@rigabras/shared';
import { useCreateManutencao } from '../hooks/useManutencoes.js';
import { useVeiculosList } from '../hooks/useVeiculos.js';
import { LoadingSkeleton } from '../components/StateViews.js';
import { OpcaoAdicionarNovo, useCadastroRapido } from '../components/CadastroRapido.js';
import { todayLocalIso } from '../lib/dateOnly.js';

const TIPOS: TipoManutencaoVeiculo[] = [
  'PREVENTIVA',
  'CORRETIVA',
  'REVISAO',
  'TROCA_PNEUS',
  'OUTRO',
];

/** Formulário de registro de manutenção de veículo (Módulo 4, Controle de Frota). */
export default function ManutencaoFormPage() {
  const navigate = useNavigate();
  const { create, submitting, error } = useCreateManutencao();
  const { state: veiculosState, veiculos, reload: reloadVeiculos } = useVeiculosList();
  const novo = useCadastroRapido();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState({
    veiculo_id: '',
    tipo: 'PREVENTIVA' as TipoManutencaoVeiculo,
    data_manutencao: todayLocalIso(),
    km_veiculo: '',
    custo: '',
    descricao: '',
    proxima_manutencao_data: '',
    proxima_manutencao_km: '',
    observacoes: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const payload: CreateManutencaoVeiculoInput = {
      veiculo_id: form.veiculo_id,
      tipo: form.tipo,
      data_manutencao: form.data_manutencao,
      km_veiculo: form.km_veiculo ? Number(form.km_veiculo) : undefined,
      custo: Number(form.custo),
      descricao: form.descricao || undefined,
      proxima_manutencao_data: form.proxima_manutencao_data || undefined,
      proxima_manutencao_km: form.proxima_manutencao_km
        ? Number(form.proxima_manutencao_km)
        : undefined,
      observacoes: form.observacoes || undefined,
    };
    try {
      const { queued } = await create(payload);
      if (queued) {
        setFeedback(
          'Sem conexão: manutenção salva localmente e será sincronizada automaticamente.',
        );
        return;
      }
      navigate('/frota/manutencoes');
    } catch {
      // erro já exposto via `error`
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to="/frota/manutencoes"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para manutenções
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Nova manutenção</h1>
      {novo.modal}

      {veiculosState === 'loading' ? (
        <LoadingSkeleton rows={2} />
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-slate-200 p-6 bg-white shadow-sm"
        >
          <Field label="Veículo *">
            <select
              required
              className="input"
              value={form.veiculo_id}
              onChange={novo.aoMudar('veiculo', (id) => setForm((f) => ({ ...f, veiculo_id: id })), reloadVeiculos)}
            >
              <option value="">Selecione...</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.placa} {v.modelo ? `— ${v.modelo}` : ''}
                </option>
              ))}
              <OpcaoAdicionarNovo />
            </select>
          </Field>

          <Field label="Tipo *">
            <select
              className="input"
              value={form.tipo}
              onChange={(e) =>
                setForm((f) => ({ ...f, tipo: e.target.value as TipoManutencaoVeiculo }))
              }
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data *">
              <input
                required
                type="date"
                className="input"
                value={form.data_manutencao}
                onChange={(e) => setForm((f) => ({ ...f, data_manutencao: e.target.value }))}
              />
            </Field>
            <Field label="Custo (R$) *">
              <input
                required
                type="number"
                min={0}
                step="0.01"
                className="input"
                value={form.custo}
                onChange={(e) => setForm((f) => ({ ...f, custo: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Km do veículo no momento (opcional)">
            <input
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={form.km_veiculo}
              onChange={(e) => setForm((f) => ({ ...f, km_veiculo: e.target.value }))}
            />
          </Field>

          <Field label="Descrição (opcional)">
            <input
              className="input"
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Próxima manutenção (data, opcional)">
              <input
                type="date"
                className="input"
                value={form.proxima_manutencao_data}
                onChange={(e) =>
                  setForm((f) => ({ ...f, proxima_manutencao_data: e.target.value }))
                }
              />
            </Field>
            <Field label="Próxima manutenção (km, opcional)">
              <input
                type="number"
                min={0}
                step="0.01"
                className="input"
                value={form.proxima_manutencao_km}
                onChange={(e) => setForm((f) => ({ ...f, proxima_manutencao_km: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Observações (opcional)">
            <textarea
              className="input"
              rows={2}
              value={form.observacoes}
              onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
            />
          </Field>

          {feedback && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              <WifiOff className="h-4 w-4 shrink-0" /> {feedback}
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-rigabras-500 px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
          >
            {submitting ? 'Salvando...' : 'Registrar manutenção'}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
