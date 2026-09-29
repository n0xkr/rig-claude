import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarClock, FileText, Plus, Trash2, WifiOff } from 'lucide-react';
import type {
  CreateViagemInput,
  TipoDocumentoCarga,
  UpdateViagemInput,
  Viagem,
  ViagemCargaInput,
} from '@rigabras/shared';
import { useCreateViagem } from '../hooks/useViagens.js';
import { useVeiculosList } from '../hooks/useVeiculos.js';
import { useMotoristasList } from '../hooks/useMotoristas.js';
import { api, ApiError } from '../lib/apiClient.js';
import { LoadingSkeleton, ErrorCard } from '../components/StateViews.js';

const PAISES = ['AR', 'BO', 'CL', 'PY', 'UY', 'PE', 'BR'] as const;

interface CargaForm {
  tipo_documento: TipoDocumentoCarga;
  numero_documento: string;
  mercadoria: string;
  tipo_mercadoria: string;
  peso_kg: string;
  valor_mercadoria: string;
}

const CARGA_VAZIA: CargaForm = {
  tipo_documento: 'CRT',
  numero_documento: '',
  mercadoria: '',
  tipo_mercadoria: '',
  peso_kg: '',
  valor_mercadoria: '',
};

interface FormState {
  data_programacao: string;
  placa_cavalo: string;
  placa_carreta: string;
  placa_carreta_2: string;
  motorista_id: string;
  motivo_troca_motorista: string;
  cliente: string;
  origem: string;
  destino: string;
  pais_destino: (typeof PAISES)[number];
  mercadoria: string;
  tipo_mercadoria: string;
  valor_frete: string;
  numero_mic_dta: string;
  pesquisa_ok: boolean;
  checklist_ok: boolean;
  smp_ok: boolean;
  observacoes: string;
  cargas: CargaForm[];
}

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO -> valor do <input type="datetime-local"> no fuso do navegador. */
function paraLocal(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const agoraLocal = () => paraLocal(new Date().toISOString());
const txt = (v: string) => (v.trim() === '' ? null : v.trim());
const num = (v: string) => {
  const t = v.trim().replace(/\./g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function doViagem(v: Viagem): FormState {
  return {
    data_programacao: paraLocal(v.data_programacao),
    placa_cavalo: v.placa_cavalo,
    placa_carreta: v.placa_carreta ?? '',
    placa_carreta_2: v.placa_carreta_2 ?? '',
    motorista_id: v.motorista_id ?? '',
    motivo_troca_motorista: '',
    cliente: v.cliente ?? '',
    origem: v.origem,
    destino: v.destino,
    pais_destino: (v.pais_destino as FormState['pais_destino']) ?? 'AR',
    mercadoria: v.mercadoria ?? '',
    tipo_mercadoria: v.tipo_mercadoria ?? '',
    valor_frete: v.valor_frete != null ? String(v.valor_frete) : '',
    numero_mic_dta: v.numero_mic_dta ?? '',
    pesquisa_ok: !!v.pesquisa_ok,
    checklist_ok: !!v.checklist_ok,
    smp_ok: !!v.smp_ok,
    observacoes: v.observacoes ?? '',
    cargas:
      v.cargas && v.cargas.length > 0
        ? v.cargas.map((c) => ({
            tipo_documento: c.tipo_documento,
            numero_documento: c.numero_documento,
            mercadoria: c.mercadoria ?? '',
            tipo_mercadoria: c.tipo_mercadoria ?? '',
            peso_kg: c.peso_kg != null ? String(c.peso_kg) : '',
            valor_mercadoria: c.valor_mercadoria != null ? String(c.valor_mercadoria) : '',
          }))
        : v.numero_crt
          ? [{ ...CARGA_VAZIA, numero_documento: v.numero_crt }]
          : [{ ...CARGA_VAZIA }],
  };
}

const FORM_NOVO = (): FormState => ({
  data_programacao: agoraLocal(),
  placa_cavalo: '',
  placa_carreta: '',
  placa_carreta_2: '',
  motorista_id: '',
  motivo_troca_motorista: '',
  cliente: '',
  origem: 'Uruguaiana/RS',
  destino: '',
  pais_destino: 'AR',
  mercadoria: '',
  tipo_mercadoria: '',
  valor_frete: '',
  numero_mic_dta: '',
  pesquisa_ok: false,
  checklist_ok: false,
  smp_ok: false,
  observacoes: '',
  cargas: [{ ...CARGA_VAZIA }],
});

function erroApi(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Erro inesperado';
  const campos = err.problem.errors
    ? Object.entries(err.problem.errors)
        .map(([c, m]) => `${c}: ${m.join(', ')}`)
        .join('; ')
    : '';
  return `${err.problem.detail ?? err.problem.title}${campos ? ` (${campos})` : ''}`;
}

/** Cadastro e edição de viagem (rota /viagens/nova e /viagens/:id/editar). */
export default function ViagemFormPage() {
  const { id } = useParams<{ id: string }>();
  const editando = !!id;
  const navigate = useNavigate();
  const { create, submitting: criando, error: erroCriar } = useCreateViagem();
  const { veiculos, state: veiculosState } = useVeiculosList();
  const { motoristas } = useMotoristasList();
  const [original, setOriginal] = useState<Viagem | null>(null);
  const [carregando, setCarregando] = useState(editando);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_NOVO);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!id) return;
    setCarregando(true);
    api
      .get<Viagem>(`/viagens/${id}`)
      .then((v) => {
        setOriginal(v);
        setForm(doViagem(v));
      })
      .catch((err) => setErroCarga(erroApi(err)))
      .finally(() => setCarregando(false));
  }, [id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setCarga = (i: number, p: Partial<CargaForm>) =>
    setForm((f) => ({ ...f, cargas: f.cargas.map((c, idx) => (idx === i ? { ...c, ...p } : c)) }));

  const ativos = veiculos.filter((v) => v.ativo);
  const cavalos = ativos.filter((v) => v.tipo === 'CAVALO');
  const outrosCavalos = ativos.filter((v) => v.tipo !== 'CAVALO');
  const carretas = ativos.filter((v) => v.tipo !== 'CAVALO');
  const agendada = form.data_programacao !== '' && new Date(form.data_programacao).getTime() > Date.now() + 60_000;
  const trocouMotorista =
    editando && !!original?.motorista_id && form.motorista_id !== (original.motorista_id ?? '');

  const totais = useMemo(() => {
    const peso = form.cargas.reduce((s, c) => s + (num(c.peso_kg) ?? 0), 0);
    const valor = form.cargas.reduce((s, c) => s + (num(c.valor_mercadoria) ?? 0), 0);
    return { peso, valor };
  }, [form.cargas]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setErro(null);
    if (!form.motorista_id) {
      setErro('Selecione o motorista (obrigatório; pode ser trocado depois).');
      return;
    }
    if (trocouMotorista && form.motivo_troca_motorista.trim().length < 3) {
      setErro('Informe o motivo da troca de motorista.');
      return;
    }
    const cargas: ViagemCargaInput[] = form.cargas
      .filter((c) => c.numero_documento.trim() !== '')
      .map((c) => ({
        tipo_documento: c.tipo_documento,
        numero_documento: c.numero_documento.trim(),
        mercadoria: txt(c.mercadoria),
        tipo_mercadoria: txt(c.tipo_mercadoria),
        peso_kg: num(c.peso_kg),
        valor_mercadoria: num(c.valor_mercadoria),
      }));
    const veiculo = veiculos.find((v) => v.placa === form.placa_cavalo);
    const base = {
      data_programacao: form.data_programacao ? new Date(form.data_programacao).toISOString() : undefined,
      placa_cavalo: form.placa_cavalo,
      veiculo_id: veiculo?.id,
      placa_carreta: txt(form.placa_carreta),
      placa_carreta_2: txt(form.placa_carreta_2),
      motorista_id: form.motorista_id,
      cliente: txt(form.cliente),
      origem: form.origem.trim(),
      destino: form.destino.trim(),
      pais_destino: form.pais_destino,
      mercadoria: txt(form.mercadoria) ?? undefined,
      tipo_mercadoria: txt(form.tipo_mercadoria) ?? undefined,
      valor_frete: num(form.valor_frete),
      numero_mic_dta: txt(form.numero_mic_dta),
      pesquisa_ok: form.pesquisa_ok,
      checklist_ok: form.checklist_ok,
      smp_ok: form.smp_ok,
      observacoes: txt(form.observacoes),
      cargas,
    };

    if (!editando) {
      try {
        const payload: CreateViagemInput = { ...base, status: 'PROGRAMADA' } as CreateViagemInput;
        const { queued } = await create(payload);
        if (queued) {
          setFeedback('Sem conexão: viagem salva localmente e será sincronizada automaticamente.');
          return;
        }
        navigate('/viagens');
      } catch {
        // erro exposto via `erroCriar`
      }
      return;
    }

    setSalvando(true);
    try {
      const payload: UpdateViagemInput = {
        ...base,
        ...(trocouMotorista ? { motivo_troca_motorista: form.motivo_troca_motorista.trim() } : {}),
      } as UpdateViagemInput;
      await api.patch<Viagem>(`/viagens/${id}`, payload);
      navigate(`/viagens/${id}`);
    } catch (err) {
      setErro(erroApi(err));
    } finally {
      setSalvando(false);
    }
  }

  if (carregando)
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <LoadingSkeleton rows={4} />
      </div>
    );
  if (erroCarga)
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <ErrorCard message={erroCarga} onRetry={() => window.location.reload()} />
      </div>
    );

  const submitting = criando || salvando;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {editando && (
        <Link to={`/viagens/${id}`} className="mb-2 inline-block text-xs text-slate-500 hover:text-blue-600">
          ← Voltar para a viagem
        </Link>
      )}
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        {editando ? `Editar viagem ${original?.numero_crt ?? original?.placa_cavalo ?? ''}` : 'Nova viagem'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6" data-testid="viagem-form">
        {/* Documentos */}
        <Secao titulo="Documentos da carga (CRT ou DANFE)" icone={<FileText className="h-4 w-4" />}>
          <p className="mb-3 text-xs text-slate-500">
            Uma viagem pode ter vários CRT/DANFE — cada um com sua mercadoria, tipo, peso e valor.
          </p>
          <div className="space-y-3">
            {form.cargas.map((c, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="viagem-carga">
                <div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto]">
                  <Field label="Tipo">
                    <select
                      className="input"
                      value={c.tipo_documento}
                      onChange={(e) => setCarga(i, { tipo_documento: e.target.value as TipoDocumentoCarga })}
                    >
                      <option value="CRT">CRT</option>
                      <option value="DANFE">DANFE / NF-e</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                  </Field>
                  <Field label="Número do CRT ou DANFE">
                    <input
                      className="input"
                      value={c.numero_documento}
                      onChange={(e) => setCarga(i, { numero_documento: e.target.value })}
                      placeholder={c.tipo_documento === 'CRT' ? 'BR.1234.00456' : 'Nº da nota ou chave de acesso'}
                      data-testid="carga-numero"
                    />
                  </Field>
                  <div className="flex items-end">
                    <button
                      type="button"
                      title="Remover documento"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          cargas: f.cargas.length > 1 ? f.cargas.filter((_, idx) => idx !== i) : [{ ...CARGA_VAZIA }],
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white p-2 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <Field label="Mercadoria">
                    <input className="input" value={c.mercadoria} onChange={(e) => setCarga(i, { mercadoria: e.target.value })} />
                  </Field>
                  <Field label="Tipo de mercadoria">
                    <input
                      className="input"
                      list="tipos-mercadoria"
                      value={c.tipo_mercadoria}
                      onChange={(e) => setCarga(i, { tipo_mercadoria: e.target.value })}
                    />
                  </Field>
                  <Field label="Peso (kg)">
                    <input className="input" inputMode="decimal" value={c.peso_kg} onChange={(e) => setCarga(i, { peso_kg: e.target.value })} />
                  </Field>
                  <Field label="Valor (R$)">
                    <input
                      className="input"
                      inputMode="decimal"
                      value={c.valor_mercadoria}
                      onChange={(e) => setCarga(i, { valor_mercadoria: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <datalist id="tipos-mercadoria">
            {['Carga seca geral', 'Aço/siderúrgicos', 'Alimentos', 'Grãos', 'Químicos', 'Eletrônicos', 'Máquinas', 'Perigosa'].map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, cargas: [...f.cargas, { ...CARGA_VAZIA }] }))}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              data-testid="carga-adicionar"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar CRT/DANFE
            </button>
            {(totais.peso > 0 || totais.valor > 0) && (
              <span className="text-xs text-slate-500">
                Total: {totais.peso.toLocaleString('pt-BR')} kg ·{' '}
                {totais.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            )}
          </div>
        </Secao>

        {/* Quando */}
        <Secao titulo="Início da viagem" icone={<CalendarClock className="h-4 w-4" />}>
          <Field label="Data e hora de início">
            <input
              type="datetime-local"
              className="input"
              value={form.data_programacao}
              onChange={(e) => set('data_programacao', e.target.value)}
              data-testid="viagem-data-inicio"
            />
          </Field>
          {agendada && (
            <p className="mt-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700" data-testid="viagem-agendada-aviso">
              Início no futuro: a viagem fica <strong>agendada</strong> e aparece em “Agendadas” até começar.
            </p>
          )}
        </Secao>

        {/* Veículo e motorista */}
        <Secao titulo="Veículo e motorista">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Placa do cavalo *">
              <select
                required
                className="input"
                value={form.placa_cavalo}
                onChange={(e) => set('placa_cavalo', e.target.value)}
                data-testid="viagem-placa-cavalo"
              >
                <option value="">Selecione...</option>
                {cavalos.map((v) => (
                  <option key={v.id} value={v.placa}>
                    {v.placa}
                    {v.marca ? ` · ${v.marca}` : ''}
                    {v.modelo ? ` ${v.modelo}` : ''}
                  </option>
                ))}
                {outrosCavalos.length > 0 && (
                  <optgroup label="Outros veículos">
                    {outrosCavalos.map((v) => (
                      <option key={v.id} value={v.placa}>
                        {v.placa} — {v.tipo.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {veiculosState === 'success' && ativos.length === 0 && (
                <span className="mt-1 block text-xs text-amber-700">
                  Nenhum veículo cadastrado. Importe a planilha da frota (Importar dados) ou cadastre em Acompanhamento.
                </span>
              )}
            </Field>
            <Field label="Placa da carreta">
              <input
                className="input uppercase"
                list="carretas"
                maxLength={8}
                value={form.placa_carreta}
                onChange={(e) => set('placa_carreta', e.target.value.toUpperCase())}
                placeholder="ABC1D23"
                data-testid="viagem-placa-carreta"
              />
            </Field>
            <Field label="Placa da 2ª carreta (se houver)">
              <input
                className="input uppercase"
                list="carretas"
                maxLength={8}
                value={form.placa_carreta_2}
                onChange={(e) => set('placa_carreta_2', e.target.value.toUpperCase())}
              />
            </Field>
            <datalist id="carretas">
              {carretas.map((v) => (
                <option key={v.id} value={v.placa}>
                  {v.tipo.replaceAll('_', ' ')}
                </option>
              ))}
            </datalist>
            <Field label="Motorista *">
              <select
                required
                className="input"
                value={form.motorista_id}
                onChange={(e) => set('motorista_id', e.target.value)}
                data-testid="viagem-motorista"
              >
                <option value="">Selecione...</option>
                {motoristas
                  .filter((m) => m.ativo || m.id === form.motorista_id)
                  .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome_completo}
                    </option>
                  ))}
              </select>
              <Link to="/motoristas/novo" className="mt-1 inline-block text-xs text-blue-600 hover:underline">
                + Cadastrar motorista
              </Link>
            </Field>
          </div>
          {trocouMotorista && (
            <div className="mt-3">
              <Field label="Motivo da troca de motorista *">
                <textarea
                  className="input"
                  rows={2}
                  value={form.motivo_troca_motorista}
                  onChange={(e) => set('motivo_troca_motorista', e.target.value)}
                  placeholder="Ex.: motorista original afastado por atestado médico"
                  data-testid="viagem-motivo-troca"
                />
              </Field>
              <p className="mt-1 text-xs text-slate-500">
                Fica registrado quem era o motorista, quem assumiu, quando e por quê.
              </p>
            </div>
          )}
        </Secao>

        {/* Rota e carga */}
        <Secao titulo="Rota e carga">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cliente">
              <input className="input" value={form.cliente} onChange={(e) => set('cliente', e.target.value)} />
            </Field>
            <Field label="Mercadoria (geral)">
              <input
                className="input"
                value={form.mercadoria}
                onChange={(e) => set('mercadoria', e.target.value)}
                placeholder="Preenchida pelos documentos se ficar vazia"
                data-testid="viagem-mercadoria"
              />
            </Field>
            <Field label="Origem *">
              <input required className="input" value={form.origem} onChange={(e) => set('origem', e.target.value)} />
            </Field>
            <Field label="Destino *">
              <input
                required
                className="input"
                value={form.destino}
                onChange={(e) => set('destino', e.target.value)}
                placeholder="Buenos Aires/AR"
              />
            </Field>
            <Field label="País de destino *">
              <select
                className="input"
                value={form.pais_destino}
                onChange={(e) => set('pais_destino', e.target.value as FormState['pais_destino'])}
              >
                {PAISES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Valor do frete (R$)">
              <input className="input" inputMode="decimal" value={form.valor_frete} onChange={(e) => set('valor_frete', e.target.value)} />
            </Field>
            <Field label="MIC/DTA">
              <input className="input" value={form.numero_mic_dta} onChange={(e) => set('numero_mic_dta', e.target.value)} />
            </Field>
          </div>
        </Secao>

        {/* Checagens */}
        <Secao titulo="Liberação (gerenciamento de risco)">
          <div className="flex flex-wrap gap-3">
            {(
              [
                ['pesquisa_ok', 'Pesquisa OK'],
                ['checklist_ok', 'Checklist OK'],
                ['smp_ok', 'SMP OK'],
              ] as const
            ).map(([k, rotulo]) => (
              <label
                key={k}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                  form[k] ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-600"
                  checked={form[k]}
                  onChange={(e) => set(k, e.target.checked)}
                  data-testid={`viagem-${k}`}
                />
                {rotulo}
              </label>
            ))}
          </div>
        </Secao>

        <Secao titulo="Observações">
          <textarea className="input" rows={3} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
        </Secao>

        {feedback && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <WifiOff className="h-4 w-4 shrink-0" /> {feedback}
          </div>
        )}
        {(erro || erroCriar) && (
          <p className="text-sm text-red-600" data-testid="viagem-form-erro">
            {erro ?? erroCriar}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-rigabras-500 px-4 py-3 font-medium text-white transition-all duration-200 hover:opacity-90 disabled:opacity-50"
          data-testid="viagem-salvar"
        >
          {submitting
            ? 'Salvando...'
            : editando
              ? 'Salvar alterações'
              : agendada
                ? 'Agendar viagem'
                : 'Criar viagem'}
        </button>
      </form>
    </div>
  );
}

function Secao({ titulo, icone, children }: { titulo: string; icone?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
        {icone} {titulo}
      </h2>
      {children}
    </section>
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
