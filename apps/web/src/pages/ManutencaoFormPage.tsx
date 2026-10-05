import { useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, WifiOff, X, Camera } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CreateManutencaoVeiculoInput, TipoManutencaoVeiculo } from '@rigabras/shared';
import { MANUTENCAO_FOTOS_MAX, MANUTENCAO_FOTO_MAX_BYTES } from '@rigabras/shared';
import { useCreateManutencao } from '../hooks/useManutencoes.js';
import { useVeiculosList } from '../hooks/useVeiculos.js';
import { usePerfil } from '../hooks/usePerfil.js';
import { LoadingSkeleton } from '../components/StateViews.js';
import { OpcaoAdicionarNovo, useCadastroRapido } from '../components/CadastroRapido.js';
import { todayLocalIso } from '../lib/dateOnly.js';
import { reduzirImagem } from '../lib/imagens.js';

const TIPOS: TipoManutencaoVeiculo[] = [
  'PREVENTIVA',
  'CORRETIVA',
  'REVISAO',
  'TROCA_PNEUS',
  'OUTRO',
];

function horaAgora(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Formulário de registro de manutenção de veículo (Módulo 4, Controle de Frota). */
export default function ManutencaoFormPage() {
  const navigate = useNavigate();
  const { create, submitting, error } = useCreateManutencao();
  const { state: veiculosState, veiculos, reload: reloadVeiculos } = useVeiculosList();
  const { perfil } = usePerfil();
  const novo = useCadastroRapido();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const [form, setForm] = useState({
    veiculo_id: '',
    tipo: 'PREVENTIVA' as TipoManutencaoVeiculo,
    data_manutencao: todayLocalIso(),
    hora: horaAgora(),
    km_veiculo: '',
    custo: '',
    descricao: '',
    proxima_manutencao_data: '',
    proxima_manutencao_km: '',
    observacoes: '',
  });

  async function aoSelecionarFotos(e: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (arquivos.length === 0) return;
    setErroFoto(null);
    setProcessandoFoto(true);
    try {
      const restantes = MANUTENCAO_FOTOS_MAX - fotos.length;
      if (arquivos.length > restantes) {
        setErroFoto(`Envie no máximo ${MANUTENCAO_FOTOS_MAX} fotos.`);
      }
      const reduzidas: string[] = [];
      for (const arquivo of arquivos.slice(0, Math.max(restantes, 0))) {
        reduzidas.push(
          await reduzirImagem(arquivo, {
            larguraMax: 1280,
            alturaMax: 1280,
            maxBytes: MANUTENCAO_FOTO_MAX_BYTES,
          }),
        );
      }
      setFotos((prev) => [...prev, ...reduzidas]);
    } catch (err) {
      setErroFoto(err instanceof Error ? err.message : 'Não foi possível processar a foto.');
    } finally {
      setProcessandoFoto(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const payload: CreateManutencaoVeiculoInput = {
      veiculo_id: form.veiculo_id,
      tipo: form.tipo,
      data_manutencao: form.data_manutencao,
      hora: form.hora || undefined,
      km_veiculo: form.km_veiculo ? Number(form.km_veiculo) : undefined,
      custo: Number(form.custo),
      descricao: form.descricao || undefined,
      proxima_manutencao_data: form.proxima_manutencao_data || undefined,
      proxima_manutencao_km: form.proxima_manutencao_km
        ? Number(form.proxima_manutencao_km)
        : undefined,
      observacoes: form.observacoes || undefined,
      fotos: fotos.length > 0 ? fotos : undefined,
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

          <div className="grid grid-cols-3 gap-3">
            <Field label="Data *">
              <input
                required
                type="date"
                className="input"
                value={form.data_manutencao}
                onChange={(e) => setForm((f) => ({ ...f, data_manutencao: e.target.value }))}
              />
            </Field>
            <Field label="Hora">
              <input
                type="time"
                className="input"
                value={form.hora}
                onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                data-testid="manutencao-hora"
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

          <Field label="Solicitante">
            <input
              className="input bg-slate-50 text-slate-600"
              readOnly
              value={perfil?.nome_completo ?? ''}
              placeholder="Usuário logado"
              data-testid="manutencao-solicitante"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Registrado automaticamente junto com a data e a hora desta solicitação.
            </span>
          </Field>

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

          <Field label={`Fotos do veículo (opcional, até ${MANUTENCAO_FOTOS_MAX})`}>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all duration-200">
                {processandoFoto ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                {processandoFoto ? 'Processando...' : 'Adicionar fotos'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  disabled={processandoFoto || fotos.length >= MANUTENCAO_FOTOS_MAX}
                  onChange={(e) => void aoSelecionarFotos(e)}
                  data-testid="manutencao-fotos"
                />
              </label>
              {fotos.map((foto, i) => (
                <span
                  key={`${i}-${foto.length}`}
                  className="relative inline-block"
                  data-testid="manutencao-foto-miniatura"
                >
                  <img src={foto} alt={`Foto ${i + 1}`} className="h-14 w-14 rounded-lg border border-slate-200 object-cover" />
                  <button
                    type="button"
                    aria-label={`Remover foto ${i + 1}`}
                    onClick={() => setFotos((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            {erroFoto && <span className="mt-1 block text-xs text-red-600">{erroFoto}</span>}
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
