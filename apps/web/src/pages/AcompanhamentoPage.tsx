import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Fuel,
  Gauge,
  Pencil,
  Plus,
  Radar,
  Search,
  Sparkles,
  Trash2,
  Truck,
  Wrench,
  X,
} from 'lucide-react';
import type {
  AcompanhamentoVeiculo,
  StatusOperacionalVeiculo,
  TipoVeiculo,
} from '@rigabras/shared';
import { api } from '../lib/apiClient.js';
import { getCurrentUserRole } from '../lib/apiClient.js';
import { errorMessage, useAcompanhamento } from '../hooks/useAcompanhamento.js';
import { LoadingSkeleton, ErrorCard } from '../components/StateViews.js';
import { GlassCard, accentChip, type GlassAccent } from '../components/ui/GlassCard.js';
import { AnimatedCounter } from '../components/ui/Telemetry.js';
import { BarList, DonutChart } from '../components/charts/Charts.js';
import { InsightsPanel } from '../components/InsightsPanel.js';
import { ImportacaoInteligente } from '../components/ImportacaoInteligente.js';
import { haptic } from '../lib/haptics.js';

const STATUS_LABEL: Record<StatusOperacionalVeiculo, string> = {
  DISPONIVEL: 'Disponível',
  EM_TRANSITO: 'Em trânsito',
  MANUTENCAO: 'Manutenção',
  GARAGEM: 'Garagem',
};
const STATUS_COLOR: Record<StatusOperacionalVeiculo, string> = {
  DISPONIVEL: '#10b981',
  EM_TRANSITO: '#2563eb',
  MANUTENCAO: '#ef4444',
  GARAGEM: '#f59e0b',
};
const TIPOS: TipoVeiculo[] = ['CAVALO', 'CARRETA_ABERTA', 'CARRETA_SIDER', 'CARRETA_OUTRO'];

interface FormState {
  placa: string;
  tipo: TipoVeiculo;
  marca: string;
  modelo: string;
  ano_fabricacao: string;
  status_operacional: StatusOperacionalVeiculo;
  motorista_atual: string;
  km_atual: string;
  nivel_combustivel: string;
  localizacao_atual: string;
  ultima_manutencao_data: string;
  proxima_manutencao_data: string;
  observacoes_acompanhamento: string;
}

const FORM_VAZIO: FormState = {
  placa: '',
  tipo: 'CAVALO',
  marca: '',
  modelo: '',
  ano_fabricacao: '',
  status_operacional: 'DISPONIVEL',
  motorista_atual: '',
  km_atual: '',
  nivel_combustivel: '',
  localizacao_atual: '',
  ultima_manutencao_data: '',
  proxima_manutencao_data: '',
  observacoes_acompanhamento: '',
};

const texto = (v: string) => (v.trim() === '' ? null : v.trim());
const numero = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

function doVeiculo(v: AcompanhamentoVeiculo): FormState {
  return {
    placa: v.placa,
    tipo: v.tipo,
    marca: v.marca ?? '',
    modelo: v.modelo ?? '',
    ano_fabricacao: v.ano_fabricacao != null ? String(v.ano_fabricacao) : '',
    status_operacional: v.status_operacional,
    motorista_atual: v.motorista_atual ?? '',
    km_atual: v.km_atual != null ? String(v.km_atual) : '',
    nivel_combustivel: v.nivel_combustivel != null ? String(v.nivel_combustivel) : '',
    localizacao_atual: v.localizacao_atual ?? '',
    ultima_manutencao_data: v.ultima_manutencao_data?.slice(0, 10) ?? '',
    proxima_manutencao_data: v.proxima_manutencao_data?.slice(0, 10) ?? '',
    observacoes_acompanhamento: v.observacoes_acompanhamento ?? '',
  };
}

function diasAte(data?: string | null): number | null {
  if (!data) return null;
  const alvo = Date.parse(`${data.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(alvo)) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje.getTime()) / 86_400_000);
}

const corCombustivel = (n: number) => (n <= 25 ? '#ef4444' : n <= 50 ? '#f59e0b' : '#10b981');

function Modal({
  titulo,
  onClose,
  children,
  largo = false,
}: {
  titulo: string;
  onClose: () => void;
  children: ReactNode;
  largo?: boolean;
}) {
  // Fecha com Esc e trava a rolagem do fundo enquanto aberto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  // Portal no <body>: um ancestral com transform/filtro (animação de página,
  // cartões com efeito 3D) prendia o `position: fixed` dentro dele e o modal
  // abria fora da tela — por isso "Editar veículo" parecia não abrir nada.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className={`max-h-[92vh] w-full ${largo ? 'max-w-5xl' : 'max-w-2xl'} overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-xl`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={titulo}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{titulo}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-xl p-1 text-slate-500 hover:bg-slate-50 transition-all duration-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function VeiculoForm({
  inicial,
  editando,
  onSaved,
  onCancel,
}: {
  inicial: FormState;
  editando: AcompanhamentoVeiculo | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<FormState>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    const payload = {
      placa: f.placa.trim().toUpperCase(),
      tipo: f.tipo,
      marca: texto(f.marca),
      modelo: texto(f.modelo),
      ano_fabricacao: numero(f.ano_fabricacao),
      status_operacional: f.status_operacional,
      motorista_atual: texto(f.motorista_atual),
      km_atual: numero(f.km_atual),
      nivel_combustivel: numero(f.nivel_combustivel),
      localizacao_atual: texto(f.localizacao_atual),
      ultima_manutencao_data: texto(f.ultima_manutencao_data),
      proxima_manutencao_data: texto(f.proxima_manutencao_data),
      observacoes_acompanhamento: texto(f.observacoes_acompanhamento),
    };
    try {
      if (editando) await api.patch(`/veiculos/${editando.id}`, payload);
      else await api.post('/veiculos', { ...payload, frota_propria: true, ativo: true });
      haptic('success');
      onSaved();
    } catch (err) {
      haptic('error');
      setErro(errorMessage(err));
    } finally {
      setSalvando(false);
    }
  }

  const campo = (label: string, el: ReactNode) => (
    <label className="block text-xs text-slate-500">
      {label}
      <div className="mt-1">{el}</div>
    </label>
  );

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" data-testid="veiculo-form">
      {campo(
        'Placa *',
        <input
          className="input"
          required
          minLength={6}
          maxLength={8}
          value={f.placa}
          onChange={(e) => set('placa', e.target.value.toUpperCase())}
          data-testid="vf-placa"
        />,
      )}
      {campo(
        'Tipo',
        <select
          className="input"
          value={f.tipo}
          onChange={(e) => set('tipo', e.target.value as TipoVeiculo)}
        >
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, ' ')}
            </option>
          ))}
        </select>,
      )}
      {campo(
        'Marca',
        <input className="input" value={f.marca} onChange={(e) => set('marca', e.target.value)} />,
      )}
      {campo(
        'Modelo',
        <input
          className="input"
          value={f.modelo}
          onChange={(e) => set('modelo', e.target.value)}
        />,
      )}
      {campo(
        'Ano',
        <input
          className="input"
          type="number"
          min={1980}
          max={2100}
          value={f.ano_fabricacao}
          onChange={(e) => set('ano_fabricacao', e.target.value)}
        />,
      )}
      {campo(
        'Status',
        <select
          className="input"
          value={f.status_operacional}
          onChange={(e) => set('status_operacional', e.target.value as StatusOperacionalVeiculo)}
          data-testid="vf-status"
        >
          {(Object.keys(STATUS_LABEL) as StatusOperacionalVeiculo[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>,
      )}
      {campo(
        'Motorista atual',
        <input
          className="input"
          value={f.motorista_atual}
          onChange={(e) => set('motorista_atual', e.target.value)}
        />,
      )}
      {campo(
        'Quilometragem (km)',
        <input
          className="input"
          type="number"
          min={0}
          step="0.1"
          value={f.km_atual}
          onChange={(e) => set('km_atual', e.target.value)}
          data-testid="vf-km"
        />,
      )}
      {campo(
        'Combustível (%)',
        <input
          className="input"
          type="number"
          min={0}
          max={100}
          value={f.nivel_combustivel}
          onChange={(e) => set('nivel_combustivel', e.target.value)}
        />,
      )}
      {campo(
        'Localização atual',
        <input
          className="input"
          value={f.localizacao_atual}
          onChange={(e) => set('localizacao_atual', e.target.value)}
        />,
      )}
      {campo(
        'Última manutenção',
        <input
          className="input"
          type="date"
          value={f.ultima_manutencao_data}
          onChange={(e) => set('ultima_manutencao_data', e.target.value)}
        />,
      )}
      {campo(
        'Próxima manutenção',
        <input
          className="input"
          type="date"
          value={f.proxima_manutencao_data}
          onChange={(e) => set('proxima_manutencao_data', e.target.value)}
        />,
      )}
      <div className="sm:col-span-2">
        {campo(
          'Observações',
          <textarea
            className="input"
            rows={2}
            value={f.observacoes_acompanhamento}
            onChange={(e) => set('observacoes_acompanhamento', e.target.value)}
          />,
        )}
      </div>
      {erro && <p className="text-sm text-red-600 sm:col-span-2">{erro}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-all duration-200 bg-white shadow-sm"
        >
          Cancelar
        </button>
        <button type="submit" disabled={salvando} className="btn-brand" data-testid="vf-salvar">
          {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Cadastrar veículo'}
        </button>
      </div>
    </form>
  );
}

function Kpi({
  icon,
  label,
  value,
  accent,
  sufixo,
}: {
  icon: ReactNode;
  label: string;
  value: number | null;
  accent: GlassAccent;
  sufixo?: string;
}) {
  return (
    <GlassCard accent={accent} className="p-6">
      <div
        className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${accentChip(accent)}`}
      >
        {icon}
      </div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-bold text-slate-900">
        {value == null ? '—' : <AnimatedCounter value={value} suffix={sufixo} />}
      </dd>
    </GlassCard>
  );
}

/**
 * Acompanhamento de veículos: visão consolidada da frota alimentada por
 * planilhas (importação com IA) ou cadastro manual — com gráficos, insights
 * gerados por IA em cada indicador e edição/exclusão de cada veículo.
 */
export default function AcompanhamentoPage() {
  const role = getCurrentUserRole();
  const podeEditar = role === 'SUPERADMIN' || role === 'ADMIN' || role === 'OPERADOR';
  const podeExcluir = role === 'SUPERADMIN' || role === 'ADMIN';
  const { state, veiculos, resumo, error, reload } = useAcompanhamento();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<StatusOperacionalVeiculo | ''>('');
  const [modal, setModal] = useState<'novo' | 'importar' | AcompanhamentoVeiculo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return veiculos.filter(
      (v) =>
        (!filtro || v.status_operacional === filtro) &&
        (!q ||
          [v.placa, v.modelo, v.marca, v.motorista_atual, v.localizacao_atual].some((x) =>
            x?.toLowerCase().includes(q),
          )),
    );
  }, [veiculos, busca, filtro]);

  async function excluir(v: AcompanhamentoVeiculo) {
    if (
      !window.confirm(`Excluir o veículo ${v.placa}? Esta ação remove o veículo do acompanhamento.`)
    )
      return;
    try {
      await api.delete(`/veiculos/${v.id}`);
      haptic('warning');
      setAviso(`Veículo ${v.placa} excluído.`);
      await reload();
    } catch (err) {
      setAviso(errorMessage(err));
    }
  }

  async function aposSalvar() {
    setModal(null);
    setAviso('Alterações salvas.');
    await reload();
  }

  if (state === 'loading' || state === 'idle')
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <LoadingSkeleton rows={5} />
      </div>
    );
  if (state === 'error')
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <ErrorCard message={error ?? 'Erro'} onRetry={reload} />
      </div>
    );

  const r = resumo!;
  const slices = (Object.keys(STATUS_LABEL) as StatusOperacionalVeiculo[]).map((s) => ({
    label: STATUS_LABEL[s],
    value: r.por_status[s] ?? 0,
    color: STATUS_COLOR[s],
  }));
  const comCombustivel = veiculos
    .filter((v) => v.nivel_combustivel != null)
    .sort((a, b) => (a.nivel_combustivel ?? 0) - (b.nivel_combustivel ?? 0))
    .slice(0, 12);
  const manutencoes = veiculos
    .map((v) => ({ v, dias: diasAte(v.proxima_manutencao_data) }))
    .filter((x): x is { v: AcompanhamentoVeiculo; dias: number } => x.dias !== null)
    .sort((a, b) => a.dias - b.dias)
    .slice(0, 10);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8" data-testid="acompanhamento-page">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Radar className="h-6 w-6 text-blue-600" /> Acompanhamento de veículos
          </h1>
          <p className="text-sm text-slate-500">
            Situação da frota em tempo real, alimentada por planilhas e interpretada por IA.
          </p>
        </div>
        {podeEditar && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setModal('importar')}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-100 transition-all duration-200"
              data-testid="btn-importar-ia"
            >
              <Sparkles className="h-4 w-4" /> Importar planilha (IA)
            </button>
            <button
              type="button"
              onClick={() => setModal('novo')}
              className="btn-brand"
              data-testid="btn-novo-veiculo"
            >
              <Plus className="h-4 w-4" /> Novo veículo
            </button>
          </div>
        )}
      </div>

      {aviso && (
        <p
          className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          data-testid="acomp-aviso"
        >
          {aviso}
        </p>
      )}

      <dl className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Kpi
          icon={<Truck className="h-5 w-5" />}
          label="Frota total"
          value={r.total}
          accent="cyan"
        />
        <Kpi
          icon={<Gauge className="h-5 w-5" />}
          label="Em trânsito"
          value={r.por_status.EM_TRANSITO ?? 0}
          accent="cyan"
        />
        <Kpi
          icon={<Truck className="h-5 w-5" />}
          label="Disponíveis"
          value={r.por_status.DISPONIVEL ?? 0}
          accent="emerald"
        />
        <Kpi
          icon={<Wrench className="h-5 w-5" />}
          label="Manutenção/garagem"
          value={(r.por_status.MANUTENCAO ?? 0) + (r.por_status.GARAGEM ?? 0)}
          accent="amber"
        />
        <Kpi
          icon={<Fuel className="h-5 w-5" />}
          label="Combustível médio"
          value={r.combustivel_medio}
          sufixo="%"
          accent="emerald"
        />
        <Kpi
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Manutenção vencida"
          value={r.manutencao_vencida.length}
          accent="scarlet"
        />
      </dl>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <GlassCard accent="cyan" tilt={0} className="p-6">
          <h2 className="mb-4 text-base font-bold text-slate-900">Status da frota</h2>
          <DonutChart data={slices} />
          <InsightsPanel escopo="status" />
        </GlassCard>

        <GlassCard accent="amber" tilt={0} className="p-6">
          <h2 className="mb-4 text-base font-bold text-slate-900">Quilometragem por veículo</h2>
          <BarList
            data={r.km_por_veiculo.map((k) => ({
              label: k.placa,
              value: k.km,
              display: `${k.km.toLocaleString('pt-BR')} km`,
              color: '#f59e0b',
            }))}
            emptyText="Sem quilometragem informada"
          />
          <InsightsPanel escopo="quilometragem" />
        </GlassCard>

        <GlassCard accent="emerald" tilt={0} className="p-6">
          <h2 className="mb-4 text-base font-bold text-slate-900">Nível de combustível</h2>
          <BarList
            max={100}
            data={comCombustivel.map((v) => ({
              label: v.placa,
              value: v.nivel_combustivel ?? 0,
              display: `${v.nivel_combustivel}%`,
              color: corCombustivel(v.nivel_combustivel ?? 0),
            }))}
            emptyText="Sem nível de combustível informado"
          />
          <InsightsPanel escopo="combustivel" />
        </GlassCard>

        <GlassCard accent="scarlet" tilt={0} className="p-6">
          <h2 className="mb-4 text-base font-bold text-slate-900">Próximas manutenções</h2>
          <BarList
            max={Math.max(60, ...manutencoes.map((m) => Math.abs(m.dias)))}
            data={manutencoes.map(({ v, dias }) => ({
              label: v.placa,
              value: Math.abs(dias),
              display: dias < 0 ? `vencida ${-dias}d` : dias === 0 ? 'hoje' : `em ${dias}d`,
              color: dias < 0 ? '#ef4444' : dias <= 30 ? '#f59e0b' : '#10b981',
            }))}
            emptyText="Sem datas de manutenção informadas"
          />
          <InsightsPanel escopo="manutencao" />
        </GlassCard>
      </div>

      <GlassCard accent="cyan" tilt={0} className="mb-6 p-6">
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
          <Sparkles className="h-4 w-4 text-blue-600" /> Análise geral da frota
        </h2>
        <p className="text-xs text-slate-500">
          A IA cruza status, quilometragem, combustível e manutenção e aponta prioridades.
        </p>
        <InsightsPanel escopo="geral" titulo="Gerar análise geral" />
      </GlassCard>

      <GlassCard accent="cyan" tilt={0} className="p-6">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              className="input pl-9"
              placeholder="Buscar placa, modelo, motorista, local..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              data-testid="acomp-busca"
            />
          </div>
          <select
            className="input w-auto"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as StatusOperacionalVeiculo | '')}
            data-testid="acomp-filtro"
          >
            <option value="">Todos os status</option>
            {(Object.keys(STATUS_LABEL) as StatusOperacionalVeiculo[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        {filtrados.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500" data-testid="acomp-vazio">
            {veiculos.length === 0
              ? 'Nenhum veículo ainda. Importe a planilha da frota ou cadastre um veículo.'
              : 'Nenhum veículo corresponde ao filtro.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[52rem] text-left text-sm text-slate-700"
              data-testid="acomp-tabela"
            >
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-2">Placa</th>
                  <th className="p-2">Veículo</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Km</th>
                  <th className="p-2">Combustível</th>
                  <th className="p-2">Próx. manutenção</th>
                  <th className="p-2">Local / viagem</th>
                  {podeEditar && <th className="p-2 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((v) => {
                  const dias = diasAte(v.proxima_manutencao_data);
                  return (
                    <tr
                      key={v.id}
                      className={`border-t border-slate-200 ${podeEditar ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                      data-testid="acomp-linha"
                      onClick={() => podeEditar && setModal(v)}
                    >
                      <td className="p-2 font-mono font-semibold text-slate-900">{v.placa}</td>
                      <td className="p-2">
                        <div>{v.modelo ?? '—'}</div>
                        <div className="text-xs text-slate-500">
                          {v.motorista_atual ?? 'sem motorista'}
                        </div>
                      </td>
                      <td className="p-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{
                            background: `${STATUS_COLOR[v.status_operacional]}22`,
                            color: STATUS_COLOR[v.status_operacional],
                          }}
                        >
                          {STATUS_LABEL[v.status_operacional]}
                        </span>
                      </td>
                      <td className="p-2">
                        {v.km_atual != null ? Number(v.km_atual).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="p-2">
                        {v.nivel_combustivel != null ? (
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${v.nivel_combustivel}%`,
                                  background: corCombustivel(v.nivel_combustivel),
                                }}
                              />
                            </div>
                            <span className="text-xs">{v.nivel_combustivel}%</span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-2">
                        {v.proxima_manutencao_data ? (
                          <span
                            className={
                              dias !== null && dias < 0
                                ? 'text-red-600'
                                : dias !== null && dias <= 30
                                  ? 'text-amber-700'
                                  : ''
                            }
                          >
                            {new Date(
                              `${v.proxima_manutencao_data.slice(0, 10)}T00:00:00`,
                            ).toLocaleDateString('pt-BR')}
                            {dias !== null && dias < 0 && ' (vencida)'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-2 text-xs">
                        <div>{v.localizacao_atual ?? '—'}</div>
                        {v.viagem_ativa && (
                          <div className="text-blue-600">
                            {v.viagem_ativa.origem} → {v.viagem_ativa.destino}
                            {v.viagem_ativa.cavalo && (
                              <span className="text-slate-500"> · engatada em {v.viagem_ativa.cavalo}</span>
                            )}
                            {v.viagem_ativa.cliente && (
                              <span className="text-slate-500"> · {v.viagem_ativa.cliente}</span>
                            )}
                          </div>
                        )}
                      </td>
                      {podeEditar && (
                        <td className="p-2 text-right">
                          <button
                            type="button"
                            title="Editar"
                            className="mr-2 text-slate-600 hover:text-slate-900 transition-all duration-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModal(v);
                            }}
                            data-testid="acomp-editar"
                          >
                            <Pencil className="inline h-4 w-4" />
                          </button>
                          {podeExcluir && (
                            <button
                              type="button"
                              title="Excluir"
                              className="text-red-600 hover:text-red-700 transition-all duration-200"
                              onClick={(e) => {
                                e.stopPropagation();
                                void excluir(v);
                              }}
                              data-testid="acomp-excluir"
                            >
                              <Trash2 className="inline h-4 w-4" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {modal === 'importar' && (
        <Modal
          titulo="Importar planilhas (IA)"
          largo
          onClose={() => {
            setModal(null);
            void reload();
          }}
        >
          <ImportacaoInteligente onImported={() => void reload()} />
        </Modal>
      )}
      {modal === 'novo' && (
        <Modal titulo="Novo veículo" onClose={() => setModal(null)}>
          <VeiculoForm
            inicial={FORM_VAZIO}
            editando={null}
            onSaved={() => void aposSalvar()}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
      {modal && typeof modal === 'object' && (
        <Modal titulo={`Editar ${modal.placa}`} onClose={() => setModal(null)}>
          <VeiculoForm
            inicial={doVeiculo(modal)}
            editando={modal}
            onSaved={() => void aposSalvar()}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
