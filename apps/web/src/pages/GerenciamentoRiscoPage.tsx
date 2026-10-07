import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ExternalLink, Plus, Search, ShieldAlert, Truck } from 'lucide-react';
import type { Motorista, Viagem } from '@rigabras/shared';
import { api, ApiError, getCurrentUserRole } from '../lib/apiClient.js';
import { useMotoristasList } from '../hooks/useMotoristas.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';
import { StatusBadge } from '../components/StatusBadge.js';

interface ListResponse {
  data: Viagem[];
  nextCursor: string | null;
}

/** As 5 marcações do gerenciamento de risco por viagem (Módulo TMS + ISO 9001). */
const MARCAS = [
  ['perfil_seguranca_ok', 'OK perfil segurança'],
  ['conjunto_validado_ok', 'OK conjunto validado'],
  ['checklist_ok', 'OK checklist'],
  ['autorizacao_embarque_ok', 'OK autorização embarque'],
  ['autorizacao_motorista_enviada', 'Enviada ao motorista'],
] as const;

type MarcaChave = (typeof MARCAS)[number][0];

const FILTROS = [
  { chave: 'abertas', rotulo: 'Abertas', abertas: true },
  { chave: 'todas', rotulo: 'Todas', abertas: false },
] as const;

function rotaDoMotorista(v: Viagem): string | null {
  if (v.rota_motorista && v.rota_motorista.trim() !== '') return v.rota_motorista;
  if (!v.origem || !v.destino) return null;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(v.origem)}&destination=${encodeURIComponent(v.destino)}`;
}

/** Gerenciamento de Risco: registro de viagens com as 5 marcações de liberação + rota do motorista (ISO 9001, evidências rastreáveis via auditoria). */
export default function GerenciamentoRiscoPage() {
  const role = getCurrentUserRole();
  const podeEditar = role === 'SUPERADMIN' || role === 'ADMIN' || role === 'OPERADOR';
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['chave']>('abertas');
  const [busca, setBusca] = useState('');
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const { motoristas } = useMotoristasList();

  const recarregar = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const r = await api.get<ListResponse>('/viagens?limit=200');
      setViagens(r.data);
      setState('success');
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado');
      setState('error');
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const abertas = filtro === 'abertas';
    return viagens.filter((v) => {
      if (abertas && (v.status === 'ENCERRADA' || v.status === 'CANCELADA')) return false;
      if (!q) return true;
      return [v.numero_crt, v.codigo_externo, v.placa_cavalo, v.placa_carreta, v.origem, v.destino, v.cliente, v.mercadoria]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q));
    });
  }, [viagens, busca, filtro]);

  const totalMarcas = visiveis.filter((v) => MARCAS.every(([k]) => v[k])).length;
  const pendentes = visiveis.length - totalMarcas;

  function nomeMotorista(v: Viagem): string {
    if (!v.motorista_id) return 'Sem motorista';
    const m: Motorista | undefined = motoristas.find((x) => x.id === v.motorista_id);
    return m?.nome_completo ?? 'Motorista não cadastrado';
  }

  async function alternar(v: Viagem, chave: MarcaChave) {
    if (!podeEditar || ocupadoId) return;
    setOcupadoId(v.id);
    try {
      const atualizada = await api.patch<Viagem>(`/viagens/${v.id}`, { [chave]: !v[chave] });
      setViagens((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...atualizada } : x)));
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado');
    } finally {
      setOcupadoId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ShieldAlert className="h-6 w-6 text-amber-600" /> Gerenciamento de Risco
          </h1>
          <p className="text-sm text-slate-500">
            Liberação das viagens: perfil segurança, conjunto, checklist, autorização de embarque e envio ao motorista + rota com pedágios
          </p>
        </div>
        <Link
          to="/viagens/nova"
          className="inline-flex items-center gap-2 rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Nova viagem
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3" data-testid="riscos-kpis">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-slate-900" data-testid="riscos-total">
            {visiveis.length}
          </p>
          <p className="text-xs text-slate-500">Viagens</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-700" data-testid="riscos-liberadas">
            {totalMarcas}
          </p>
          <p className="text-xs text-emerald-700">Liberadas (5/5)</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-2xl font-bold text-amber-700" data-testid="riscos-pendentes">
            {pendentes}
          </p>
          <p className="text-xs text-amber-700">Pendentes</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2" data-testid="riscos-filtros">
        {FILTROS.map((f) => (
          <button
            key={f.chave}
            onClick={() => setFiltro(f.chave)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filtro === f.chave ? 'bg-rigabras-500 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Buscar CRT/DANFE, placa, motorista, origem, destino..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          data-testid="riscos-busca"
        />
      </div>

      {state === 'loading' && <LoadingSkeleton />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro desconhecido'} onRetry={recarregar} />}
      {state === 'success' && visiveis.length === 0 && (
        <EmptyState
          title="Nenhuma viagem por aqui"
          description="Cadastre uma viagem para acompanhar as marcações de liberação do gerenciamento de risco."
          actionLabel="Nova viagem"
          onAction={() => {
            window.location.href = '/viagens/nova';
          }}
        />
      )}

      {state === 'success' && visiveis.length > 0 && (
        <ul className="space-y-4" data-testid="riscos-lista">
          {visiveis.map((v) => {
            const marcadas = MARCAS.filter(([k]) => v[k]).length;
            const rota = rotaDoMotorista(v);
            return (
              <li
                key={v.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                data-testid={`risco-card-${v.placa_cavalo}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      <Truck className="mr-1 inline h-4 w-4 text-slate-400" />
                      {v.numero_crt ?? v.codigo_externo ?? 'CRT/DANFE pendente'} — {v.placa_cavalo}
                      {v.placa_carreta ? ` + ${v.placa_carreta}` : ''}
                    </p>
                    <p className="text-sm text-slate-500">
                      {v.origem} → {v.destino} {v.pais_destino ? `(${v.pais_destino})` : ''}
                      {v.cliente ? ` · ${v.cliente}` : ''}
                    </p>
                    <p className="text-sm text-slate-500">
                      Motorista: <span className="font-medium text-slate-700">{nomeMotorista(v)}</span>
                      {v.mercadoria ? ` · Mercadoria: ${v.mercadoria}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Marcações: <span data-testid={`risco-progresso-${v.placa_cavalo}`}>{marcadas}/5</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {rota && (
                      <a
                        href={rota}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                        data-testid={`risco-rota-${v.placa_cavalo}`}
                      >
                        <ExternalLink className="h-4 w-4" /> Rota / pedágios
                      </a>
                    )}
                    <Link
                      to={`/viagens/${v.id}/editar`}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Editar viagem
                    </Link>
                    <StatusBadge status={v.status} agendada={false} />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2" data-testid="risco-marcacoes">
                  {MARCAS.map(([k, rotulo]) => {
                    const ativo = !!v[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        disabled={!podeEditar || ocupadoId === v.id}
                        onClick={() => void alternar(v, k)}
                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all disabled:cursor-default ${
                          ativo
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-white text-slate-500'
                        }`}
                        title={podeEditar ? 'Clique para marcar/desmarcar' : undefined}
                        data-testid={`risco-${k}`}
                      >
                        {ativo ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}{' '}
                        {rotulo}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
