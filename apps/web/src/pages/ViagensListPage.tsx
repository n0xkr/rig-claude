import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, Plus, Search, Truck } from 'lucide-react';
import {
  STATUS_VIAGEM_EM_FRONTEIRA,
  viagemAgendada,
  type StatusViagem,
  type Viagem,
} from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';
import { StatusBadge } from '../components/StatusBadge.js';

interface ListResponse {
  data: Viagem[];
  nextCursor: string | null;
}

/** Filtros por fase da operação (cada um agrupa várias etapas do fluxo). */
const FILTROS: Array<{ chave: string; rotulo: string; status?: StatusViagem[]; agendadas?: boolean }> = [
  { chave: 'todas', rotulo: 'Todas' },
  { chave: 'agendadas', rotulo: 'Agendadas', status: ['PROGRAMADA'], agendadas: true },
  { chave: 'programadas', rotulo: 'Programadas', status: ['PROGRAMADA'] },
  {
    chave: 'carregamento',
    rotulo: 'Carregamento',
    status: ['EM_TRANSITO_CLIENTE', 'NO_CLIENTE_AGUARDANDO_CARREGAMENTO', 'CARREGADO_AGUARDANDO_DOCUMENTOS'],
  },
  { chave: 'transito', rotulo: 'Rumo à fronteira', status: ['EM_TRANSITO_FRONTEIRA'] },
  { chave: 'fronteira', rotulo: 'Fronteira / aduanas', status: STATUS_VIAGEM_EM_FRONTEIRA },
  {
    chave: 'destino',
    rotulo: 'Destino',
    status: ['CHEGADA_ADUANA_DESTINO', 'SAIDA_ADUANA_DESTINO', 'CHEGADA_CLIENTE', 'VAZIO_NO_CLIENTE', 'SAIDA_CLIENTE'],
  },
  { chave: 'retorno', rotulo: 'Retornando vazio', status: ['RETORNANDO_VAZIO'] },
  { chave: 'fim', rotulo: 'Fim de viagem', status: ['ENCERRADA'] },
  { chave: 'canceladas', rotulo: 'Canceladas', status: ['CANCELADA'] },
];

export default function ViagensListPage() {
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState('todas');
  const [busca, setBusca] = useState('');
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const atual = FILTROS.find((f) => f.chave === filtro)!;

  const carregar = useCallback(
    async (depois?: string | null) => {
      const params = new URLSearchParams({ limit: '200' });
      if (atual.status) params.set('status', atual.status.join(','));
      if (depois) params.set('cursor', depois);
      const r = await api.get<ListResponse>(`/viagens?${params.toString()}`);
      return r;
    },
    [atual],
  );

  const recarregar = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const r = await carregar();
      setViagens(r.data);
      setCursor(r.nextCursor);
      setState('success');
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado');
      setState('error');
    }
  }, [carregar]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function maisViagens() {
    if (!cursor) return;
    setCarregandoMais(true);
    try {
      const r = await carregar(cursor);
      setViagens((v) => [...v, ...r.data]);
      setCursor(r.nextCursor);
    } finally {
      setCarregandoMais(false);
    }
  }

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return viagens.filter((v) => {
      if (atual.agendadas && !viagemAgendada(v)) return false;
      if (atual.chave === 'programadas' && viagemAgendada(v)) return false;
      if (!q) return true;
      return [v.numero_crt, v.codigo_externo, v.placa_cavalo, v.placa_carreta, v.origem, v.destino, v.cliente, v.mercadoria]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q));
    });
  }, [viagens, busca, atual]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Viagens</h1>
          <p className="text-sm text-slate-500">Programação, acompanhamento e fim de viagem</p>
        </div>
        <Link
          to="/viagens/nova"
          className="inline-flex items-center gap-2 rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Nova viagem
        </Link>
      </div>

      <div className="mb-3 flex flex-wrap gap-2" data-testid="viagens-filtros">
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
          placeholder="Buscar CRT/DANFE, placa, cliente, origem, destino..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          data-testid="viagens-busca"
        />
      </div>

      {state === 'loading' && <LoadingSkeleton />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro desconhecido'} onRetry={recarregar} />}
      {state === 'success' && visiveis.length === 0 && (
        <EmptyState
          title={viagens.length === 0 ? 'Nenhuma viagem aqui' : 'Nada corresponde à busca'}
          description="Cadastre uma viagem ou importe a planilha de viagens (Importar dados)."
          actionLabel="Nova viagem"
          onAction={() => navigate('/viagens/nova')}
        />
      )}

      {state === 'success' && visiveis.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="viagens-lista">
          {visiveis.map((v) => {
            const agendada = viagemAgendada(v);
            return (
              <li key={v.id}>
                <Link
                  to={`/viagens/${v.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-4 transition-all duration-200 hover:bg-slate-50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {agendada ? (
                      <CalendarClock className="h-5 w-5 shrink-0 text-sky-600" />
                    ) : (
                      <Truck className="h-5 w-5 shrink-0 text-slate-500" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {v.numero_crt ?? v.codigo_externo ?? 'CRT/DANFE pendente'} — {v.placa_cavalo}
                        {v.placa_carreta ? ` + ${v.placa_carreta}` : ''}
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        {v.origem} → {v.destino} {v.pais_destino ? `(${v.pais_destino})` : ''}
                        {v.cliente ? ` · ${v.cliente}` : ''}
                        {agendada && v.data_programacao
                          ? ` · início ${new Date(v.data_programacao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
                          : ''}
                      </p>
                      <p className="mt-0.5 flex gap-1 text-[10px]">
                        {(
                          [
                            ['pesquisa_ok', 'Pesquisa'],
                            ['checklist_ok', 'Checklist'],
                            ['smp_ok', 'SMP'],
                          ] as const
                        ).map(([k, r]) => (
                          <span
                            key={k}
                            className={`rounded px-1.5 py-0.5 font-semibold ${v[k] ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}
                          >
                            {r}
                          </span>
                        ))}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={v.status} agendada={agendada} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {state === 'success' && cursor && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => void maisViagens()}
            disabled={carregandoMais}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {carregandoMais ? 'Carregando...' : 'Carregar mais viagens'}
          </button>
        </div>
      )}
    </div>
  );
}
