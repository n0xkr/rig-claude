import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import type { CreateVeiculoInput, TipoVeiculo } from '@rigabras/shared';
import { TipoVeiculoSchema } from '@rigabras/shared';
import {
  useCreateVeiculo,
  useUpdateVeiculo,
  useDeleteVeiculo,
  useVeiculoDetail,
} from '../hooks/useVeiculos.js';
import { LoadingSkeleton, ErrorCard } from '../components/StateViews.js';

const TIPOS_VEICULO: Record<TipoVeiculo, string> = {
  CAVALO: 'Cavalo',
  CARRETA_ABERTA: 'Carreta aberta',
  CARRETA_SIDER: 'Carreta sider',
  CARRETA_OUTRO: 'Carreta (outro)',
};

const VAZIO = {
  placa: '',
  tipo: 'CAVALO' as TipoVeiculo,
  marca: '',
  modelo: '',
  ano_fabricacao: '',
  capacidade_kg: '',
  rastreador_autotrac_id: '',
  frota_propria: true,
  ativo: true,
};

/** Cadastro/edição de um veículo da frota (Módulo 1 — TMS). */
export default function VeiculoFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editando = !!id;
  const { state, veiculo, error: carregandoErro } = useVeiculoDetail(id);
  const { create, submitting: criando, error: erroCriar } = useCreateVeiculo();
  const { update, submitting: atualizando, error: erroAtualizar } = useUpdateVeiculo();
  const { remove, submitting: excluindo, error: erroExcluir } = useDeleteVeiculo();
  const [form, setForm] = useState(VAZIO);

  useEffect(() => {
    if (!veiculo) return;
    setForm({
      placa: veiculo.placa,
      tipo: veiculo.tipo,
      marca: veiculo.marca ?? '',
      modelo: veiculo.modelo ?? '',
      ano_fabricacao: veiculo.ano_fabricacao != null ? String(veiculo.ano_fabricacao) : '',
      capacidade_kg: veiculo.capacidade_kg != null ? String(veiculo.capacidade_kg) : '',
      rastreador_autotrac_id: veiculo.rastreador_autotrac_id ?? '',
      frota_propria: veiculo.frota_propria,
      ativo: veiculo.ativo,
    });
  }, [veiculo]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: CreateVeiculoInput = {
      placa: form.placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
      tipo: form.tipo,
      marca: form.marca.trim() || null,
      modelo: form.modelo.trim() || null,
      ano_fabricacao: form.ano_fabricacao ? Number(form.ano_fabricacao) : null,
      frota_propria: form.frota_propria,
      capacidade_kg: form.capacidade_kg ? Number(form.capacidade_kg) : null,
      rastreador_autotrac_id: form.rastreador_autotrac_id.trim() || null,
      ativo: form.ativo,
      status_operacional: veiculo?.status_operacional ?? 'DISPONIVEL',
    };
    try {
      if (editando && id) {
        await update(id, payload);
      } else {
        await create(payload);
      }
      navigate('/frota/veiculos');
    } catch {
      // erro já exposto via hooks
    }
  }

  async function handleDelete() {
    if (!id || !veiculo) return;
    if (!window.confirm(`Excluir o veículo ${veiculo.placa}? Esta ação não pode ser desfeita.`))
      return;
    try {
      await remove(id);
      navigate('/frota/veiculos');
    } catch {
      // erro já exposto via hook
    }
  }

  const erro = erroCriar || erroAtualizar || erroExcluir;
  const submetendo = criando || atualizando;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to="/frota/veiculos"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para veículos
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        {editando ? `Editando ${veiculo?.placa ?? ''}` : 'Novo veículo'}
      </h1>

      {editando && state === 'loading' && <LoadingSkeleton rows={2} />}
      {editando && state === 'error' && (
        <ErrorCard message={carregandoErro ?? 'Erro'} onRetry={() => navigate(0)} />
      )}

      {(!editando || state === 'success') && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-slate-200 p-6 bg-white shadow-sm"
          data-testid="veiculo-form"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Placa *">
              <input
                required
                className="input uppercase"
                maxLength={8}
                placeholder="ABC1D23"
                value={form.placa}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    placa: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                  }))
                }
                data-testid="veiculo-placa"
              />
            </Field>
            <Field label="Tipo *">
              <select
                className="input"
                value={form.tipo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tipo: e.target.value as TipoVeiculo }))
                }
                data-testid="veiculo-tipo"
              >
                {TipoVeiculoSchema.options.map((t) => (
                  <option key={t} value={t}>
                    {TIPOS_VEICULO[t]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca">
              <input
                className="input"
                value={form.marca}
                onChange={(e) => setForm((f) => ({ ...f, marca: e.target.value }))}
              />
            </Field>
            <Field label="Modelo">
              <input
                className="input"
                value={form.modelo}
                onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Ano de fabricação">
              <input
                type="number"
                min={1980}
                max={2100}
                className="input"
                value={form.ano_fabricacao}
                onChange={(e) => setForm((f) => ({ ...f, ano_fabricacao: e.target.value }))}
              />
            </Field>
            <Field label="Capacidade (kg)">
              <input
                type="number"
                min={0}
                step="0.01"
                className="input"
                value={form.capacidade_kg}
                onChange={(e) => setForm((f) => ({ ...f, capacidade_kg: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Rastreador (ID AutoTrac)">
            <input
              className="input"
              value={form.rastreador_autotrac_id}
              onChange={(e) => setForm((f) => ({ ...f, rastreador_autotrac_id: e.target.value }))}
            />
          </Field>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.frota_propria}
                onChange={(e) => setForm((f) => ({ ...f, frota_propria: e.target.checked }))}
              />
              Frota própria
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
                data-testid="veiculo-ativo"
              />
              Ativo
            </label>
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submetendo}
              className="flex-1 rounded-xl bg-rigabras-500 px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
              data-testid="salvar-veiculo"
            >
              {submetendo ? 'Salvando...' : editando ? 'Salvar alterações' : 'Cadastrar veículo'}
            </button>
            {editando && (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={excluindo}
                className="flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition-all duration-200"
              >
                <Trash2 className="h-4 w-4" /> {excluindo ? 'Excluindo...' : 'Excluir'}
              </button>
            )}
          </div>
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
