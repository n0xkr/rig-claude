import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileText,
  History,
  MapPinned,
  PackageSearch,
  Pencil,
  ShieldAlert,
  Trash2,
  UserRound,
  Wallet,
} from 'lucide-react';
import {
  FLUXO_STATUS_VIAGEM,
  STATUS_VIAGEM_LABEL,
  StatusViagemSchema,
  TRANSICOES_STATUS_VIAGEM,
  viagemAgendada,
  type StatusViagem,
  type Viagem,
  type ViagemMotoristaHistorico,
} from '@rigabras/shared';
import { useViagemDetail } from '../hooks/useViagemDetail.js';
import { useViagemStatusHistory } from '../hooks/useViagemStatusHistory.js';
import { useViagemWmsStatus } from '../hooks/useViagemWmsStatus.js';
import { useChangeViagemStatus } from '../hooks/useChangeViagemStatus.js';
import { useMotoristasList } from '../hooks/useMotoristas.js';
import { api, ApiError, getCurrentUserRole } from '../lib/apiClient.js';
import { CamposAdicionais } from '../components/CamposAdicionais.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';
import {
  StatusBadge,
  SeveridadeBadge,
  ExpedicaoStatusBadge,
  RecebimentoStatusBadge,
} from '../components/StatusBadge.js';

const moeda = (v?: number | null) =>
  v == null ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (v?: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-');
const msg = (err: unknown) =>
  err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado';

export default function ViagemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const role = getCurrentUserRole();
  const admin = role === 'SUPERADMIN' || role === 'ADMIN';
  const podeEditar = admin || role === 'OPERADOR';
  const navigate = useNavigate();
  const [erroExcluir, setErroExcluir] = useState<string | null>(null);
  const { state, viagem, eventos, error, reload } = useViagemDetail(id);
  const { historico, state: historicoState, reload: reloadHistorico } = useViagemStatusHistory(id);
  const { status: wmsStatus, state: wmsState } = useViagemWmsStatus(id);
  const { motoristas } = useMotoristasList();
  const { changeStatus, submitting: submittingStatus, error: statusError } = useChangeViagemStatus(id);
  const [proximoStatus, setProximoStatus] = useState<StatusViagem | ''>('');
  const [obsStatus, setObsStatus] = useState('');
  const [histMotorista, setHistMotorista] = useState<ViagemMotoristaHistorico[]>([]);
  const [trocando, setTrocando] = useState(false);
  const [novoMotorista, setNovoMotorista] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregarHistMotorista = useCallback(async () => {
    if (!id) return;
    try {
      setHistMotorista(await api.get<ViagemMotoristaHistorico[]>(`/viagens/${id}/motorista-historico`));
    } catch {
      setHistMotorista([]);
    }
  }, [id]);
  useEffect(() => {
    void carregarHistMotorista();
  }, [carregarHistMotorista]);

  if (state === 'loading' || state === 'idle')
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <LoadingSkeleton rows={3} />
      </div>
    );
  if (state === 'error')
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <ErrorCard message={error ?? 'Erro'} onRetry={reload} />
      </div>
    );
  if (!viagem) return null;

  const nomeMotorista = (mid?: string | null) =>
    mid ? (motoristas.find((m) => m.id === mid)?.nome_completo ?? 'Motorista') : 'Sem motorista';
  const opcoesStatus: StatusViagem[] = admin
    ? StatusViagemSchema.options.filter(
        (s) => s !== viagem.status && (FLUXO_STATUS_VIAGEM.includes(s) || s === 'CANCELADA'),
      )
    : (TRANSICOES_STATUS_VIAGEM[viagem.status] ?? []);
  const idxAtual = FLUXO_STATUS_VIAGEM.indexOf(viagem.status);

  async function patch(p: Partial<Viagem>) {
    setOcupado(true);
    setErroAcao(null);
    try {
      await api.patch(`/viagens/${viagem!.id}`, p);
      await reload();
    } catch (err) {
      setErroAcao(msg(err));
    } finally {
      setOcupado(false);
    }
  }

  async function trocarMotorista() {
    if (!novoMotorista || motivo.trim().length < 3) {
      setErroAcao('Escolha o novo motorista e informe o motivo.');
      return;
    }
    setOcupado(true);
    setErroAcao(null);
    try {
      await api.patch(`/viagens/${viagem!.id}/motorista`, { motorista_id: novoMotorista, motivo: motivo.trim() });
      setTrocando(false);
      setNovoMotorista('');
      setMotivo('');
      await Promise.all([reload(), carregarHistMotorista()]);
    } catch (err) {
      setErroAcao(msg(err));
    } finally {
      setOcupado(false);
    }
  }

  const agendada = viagemAgendada(viagem);
  const cargas = viagem.cargas ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8" data-testid="viagem-detalhe">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {viagem.numero_crt ?? viagem.codigo_externo ?? 'CRT/DANFE pendente'}
          </h1>
          <p className="text-sm text-slate-500">
            {viagem.origem} → {viagem.destino} {viagem.pais_destino ? `(${viagem.pais_destino})` : ''}
            {viagem.codigo_externo && viagem.numero_crt ? ` · viagem ${viagem.codigo_externo}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={viagem.status} agendada={agendada} />
          {podeEditar && (
            <Link
              to={`/viagens/${viagem.id}/editar`}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
              data-testid="viagem-editar"
            >
              <Pencil className="h-4 w-4" /> Editar
            </Link>
          )}
          {admin && (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm('Excluir esta viagem? Ela sai das listas (fica na lixeira do Gerenciar dados).')) return;
                try {
                  await api.delete(`/viagens/${viagem.id}`);
                  navigate('/viagens', { replace: true });
                } catch (err) {
                  setErroExcluir(msg(err));
                }
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 shadow-sm hover:bg-red-50"
              data-testid="viagem-excluir"
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </button>
          )}
        </div>
      </div>
      {erroExcluir && (
        <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erroExcluir}
        </p>
      )}

      {agendada && (
        <p className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700">
          Viagem agendada para {dataHora(viagem.data_programacao)}.
        </p>
      )}

      <dl className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-6 text-sm shadow-sm sm:grid-cols-3">
        <Info label="Início" value={dataHora(viagem.data_programacao)} />
        <Info label="Placa do cavalo" value={viagem.placa_cavalo} />
        <Info
          label="Placa da carreta"
          value={[viagem.placa_carreta, viagem.placa_carreta_2].filter(Boolean).join(' + ') || '-'}
        />
        <Info label="Motorista" value={nomeMotorista(viagem.motorista_id)} />
        <Info label="Cliente" value={viagem.cliente ?? '-'} />
        <Info label="Mercadoria" value={viagem.mercadoria ?? '-'} />
        <Info label="Tipo de mercadoria" value={viagem.tipo_mercadoria ?? '-'} />
        <Info label="Peso total" value={viagem.peso_kg != null ? `${viagem.peso_kg.toLocaleString('pt-BR')} kg` : '-'} />
        <Info label="Valor da mercadoria" value={moeda(viagem.valor_mercadoria)} />
        <Info label="Valor do frete" value={moeda(viagem.valor_frete)} />
        <Info label="MIC/DTA" value={viagem.numero_mic_dta ?? '-'} />
      </dl>

      <CamposAdicionais entidade="viagens" extras={viagem.dados_extras} />

      {/* Checagens de liberação */}
      <div className="mb-6 flex flex-wrap gap-2" data-testid="viagem-checagens">
        {(
          [
            ['pesquisa_ok', 'Pesquisa OK'],
            ['checklist_ok', 'Checklist OK'],
            ['smp_ok', 'SMP OK'],
            ['perfil_seguranca_ok', 'OK perfil segurança'],
            ['conjunto_validado_ok', 'OK conjunto validado'],
            ['autorizacao_embarque_ok', 'OK autorização embarque'],
            ['autorizacao_motorista_enviada', 'Autorização enviada'],
          ] as const
        ).map(([k, rotulo]) => {
          const ativo = !!viagem[k];
          return (
            <button
              key={k}
              type="button"
              disabled={!podeEditar || ocupado}
              onClick={() => void patch({ [k]: !ativo })}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all disabled:cursor-default ${
                ativo ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'
              }`}
              title={podeEditar ? 'Clique para marcar/desmarcar' : undefined}
              data-testid={`check-${k}`}
            >
              {ativo ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />} {rotulo}
            </button>
          );
        })}
      </div>

      {/* Documentos */}
      <Titulo icone={<FileText className="h-5 w-5 text-slate-500" />} texto="Documentos da carga (CRT/DANFE)" />
      {cargas.length === 0 ? (
        <p className="mb-6 text-sm text-slate-500">
          Nenhum CRT/DANFE vinculado.{' '}
          {podeEditar && (
            <Link to={`/viagens/${viagem.id}/editar`} className="text-blue-600 hover:underline">
              Adicionar
            </Link>
          )}
        </p>
      ) : (
        <div className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[36rem] text-left text-sm" data-testid="viagem-cargas">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="p-2">Documento</th>
                <th className="p-2">Mercadoria</th>
                <th className="p-2">Tipo</th>
                <th className="p-2 text-right">Peso (kg)</th>
                <th className="p-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {cargas.map((c) => (
                <tr key={c.id} className="border-t border-slate-200">
                  <td className="p-2 font-medium text-slate-900">
                    <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      {c.tipo_documento}
                    </span>
                    {c.numero_documento}
                  </td>
                  <td className="p-2">{c.mercadoria ?? '-'}</td>
                  <td className="p-2">{c.tipo_mercadoria ?? '-'}</td>
                  <td className="p-2 text-right">{c.peso_kg != null ? c.peso_kg.toLocaleString('pt-BR') : '-'}</td>
                  <td className="p-2 text-right">{moeda(c.valor_mercadoria)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Motorista */}
      <Titulo icone={<UserRound className="h-5 w-5 text-slate-500" />} texto="Motorista" />
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-slate-900">{nomeMotorista(viagem.motorista_id)}</p>
          {podeEditar && !trocando && (
            <button
              type="button"
              onClick={() => setTrocando(true)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              data-testid="motorista-trocar"
            >
              Trocar motorista
            </button>
          )}
        </div>
        {trocando && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select className="input" value={novoMotorista} onChange={(e) => setNovoMotorista(e.target.value)} data-testid="motorista-novo">
              <option value="">Novo motorista...</option>
              {motoristas
                .filter((m) => m.ativo && m.id !== viagem.motorista_id)
                .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome_completo}
                  </option>
                ))}
            </select>
            <input
              className="input"
              placeholder="Motivo da troca *"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              data-testid="motorista-motivo"
            />
            <div className="flex gap-2 sm:col-span-2">
              <button type="button" disabled={ocupado} onClick={() => void trocarMotorista()} className="btn-brand !py-1.5 !text-xs" data-testid="motorista-confirmar">
                Confirmar troca
              </button>
              <button
                type="button"
                onClick={() => setTrocando(false)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        {histMotorista.length > 0 && (
          <ol className="mt-4 space-y-2 border-l border-slate-200 pl-4 text-sm" data-testid="motorista-historico">
            {histMotorista.map((h) => (
              <li key={h.id}>
                <span className="text-slate-900">
                  {h.motorista_anterior_id
                    ? `${h.motorista_anterior_nome ?? nomeMotorista(h.motorista_anterior_id)} → ${h.motorista_novo_nome ?? nomeMotorista(h.motorista_novo_id)}`
                    : `Primeiro motorista: ${h.motorista_novo_nome ?? nomeMotorista(h.motorista_novo_id)}`}
                </span>
                <span className="ml-2 text-xs text-slate-500">{dataHora(h.created_at)}</span>
                {h.motivo && <p className="text-xs text-slate-500">Motivo: {h.motivo}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <Atalho to={`/viagens/${viagem.id}/fronteira`} icone={<MapPinned className="h-4 w-4" />} texto="Travessia de fronteira" />
        <Atalho
          to={`/viagens/${viagem.id}/validacao-pre-embarque`}
          icone={<ClipboardCheck className="h-4 w-4" />}
          texto="Validação pré-embarque"
        />
        <Atalho to={`/viagens/${viagem.id}/frete`} icone={<Wallet className="h-4 w-4" />} texto="Fechamento financeiro do frete" />
      </div>

      {/* Fluxo */}
      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-700">Etapa da viagem</h2>
        <ol className="mb-4 flex flex-wrap gap-1.5" data-testid="viagem-fluxo">
          {FLUXO_STATUS_VIAGEM.map((s, i) => (
            <li
              key={s}
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                s === viagem.status
                  ? 'bg-rigabras-500 font-semibold text-white'
                  : idxAtual >= 0 && i < idxAtual
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {STATUS_VIAGEM_LABEL[s]}
            </li>
          ))}
        </ol>
        {!podeEditar ? null : opcoesStatus.length === 0 ? (
          <p className="text-sm text-slate-500">Viagem finalizada — sem próximas etapas.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input sm:w-auto"
              data-testid="viagem-proximo-status"
              value={proximoStatus}
              onChange={(e) => setProximoStatus(e.target.value as StatusViagem)}
            >
              <option value="">Mudar para...</option>
              {opcoesStatus.map((s) => (
                <option key={s} value={s}>
                  {STATUS_VIAGEM_LABEL[s]}
                </option>
              ))}
            </select>
            <input
              className="input min-w-[12rem] flex-1"
              placeholder="Observação (opcional)"
              value={obsStatus}
              onChange={(e) => setObsStatus(e.target.value)}
            />
            <button
              type="button"
              disabled={!proximoStatus || submittingStatus}
              data-testid="viagem-confirmar-status"
              onClick={async () => {
                if (!proximoStatus) return;
                const ok = await changeStatus(proximoStatus, obsStatus.trim() || undefined);
                if (ok) {
                  setProximoStatus('');
                  setObsStatus('');
                  reload();
                  reloadHistorico();
                }
              }}
              className="rounded-xl bg-rigabras-500 px-3 py-2 text-sm font-medium text-white transition-all duration-200 hover:opacity-90 disabled:opacity-50"
            >
              {submittingStatus ? 'Aplicando...' : 'Confirmar'}
            </button>
          </div>
        )}
        {admin && (
          <p className="mt-2 text-xs text-slate-500">Como administrador você pode ajustar para qualquer etapa.</p>
        )}
        {(statusError || erroAcao) && <p className="mt-2 text-sm text-red-600">{statusError ?? erroAcao}</p>}
      </div>

      <Titulo icone={<History className="h-5 w-5 text-slate-500" />} texto="Linha do tempo" />
      {historicoState === 'loading' ? (
        <LoadingSkeleton rows={2} />
      ) : historico.length === 0 ? (
        <p className="mb-8 text-sm text-slate-500">Nenhuma mudança de etapa registrada ainda.</p>
      ) : (
        <ol className="mb-8 space-y-3 border-l border-slate-200 pl-4">
          {historico.map((h) => {
            const isWms = h.origem_evento === 'WMS';
            return (
              <li key={h.id} className="relative">
                <span
                  className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${isWms ? 'bg-amber-500' : 'bg-rigabras-500'}`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {isWms ? (
                    <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      <PackageSearch className="h-3 w-3" /> WMS
                    </span>
                  ) : (
                    h.status_anterior && (
                      <span className="text-xs text-slate-500">{STATUS_VIAGEM_LABEL[h.status_anterior] ?? h.status_anterior} →</span>
                    )
                  )}
                  {!isWms && <StatusBadge status={h.status_novo} />}
                  <span className="text-xs text-slate-500">{dataHora(h.created_at)}</span>
                </div>
                {h.observacoes && <p className="mt-1 text-sm text-slate-500">{h.observacoes}</p>}
              </li>
            );
          })}
        </ol>
      )}

      <Titulo icone={<PackageSearch className="h-5 w-5 text-slate-500" />} texto="Integração com o armazém (WMS)" />
      {wmsState === 'loading' ? (
        <LoadingSkeleton rows={1} />
      ) : !wmsStatus || (!wmsStatus.expedicao && !wmsStatus.recebimento) ? (
        <p className="mb-8 text-sm text-slate-500">Nenhuma expedição ou recebimento do armazém vinculados a esta viagem.</p>
      ) : (
        <div className="mb-8 space-y-3">
          {wmsStatus.expedicao && (
            <Link
              to={`/wms/expedicoes/${wmsStatus.expedicao.id}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:bg-slate-50"
            >
              <div>
                <p className="text-sm text-slate-500">Expedição vinculada</p>
                <p className="font-medium text-slate-900">
                  {wmsStatus.expedicao.referencia_documento ?? wmsStatus.expedicao.id.slice(0, 8)}
                </p>
              </div>
              <ExpedicaoStatusBadge status={wmsStatus.expedicao.status ?? 'SOLICITADA'} />
            </Link>
          )}
          {wmsStatus.recebimento && (
            <Link
              to={`/wms/recebimentos/${wmsStatus.recebimento.id}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:bg-slate-50"
            >
              <div>
                <p className="text-sm text-slate-500">Recebimento gerado a partir da entrega</p>
                <p className="font-medium text-slate-900">
                  {wmsStatus.recebimento.referencia_documento ?? wmsStatus.recebimento.id.slice(0, 8)}
                </p>
              </div>
              <RecebimentoStatusBadge status={wmsStatus.recebimento.status ?? 'AGUARDANDO'} />
            </Link>
          )}
        </div>
      )}

      <Titulo icone={<ShieldAlert className="h-5 w-5 text-amber-600" />} texto="Eventos de risco" />
      {eventos.length === 0 ? (
        <EmptyState
          title="Nenhum evento de risco registrado"
          description="Esta viagem ainda não possui ocorrências registradas pelo monitoramento ou pela análise de IA."
        />
      ) : (
        <ul className="space-y-3">
          {eventos.map((ev) => (
            <li key={ev.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-slate-900">{ev.tipo}</span>
                <SeveridadeBadge severidade={ev.severidade} />
              </div>
              <p className="text-sm text-slate-500">{ev.descricao}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Titulo({ icone, texto }: { icone: React.ReactNode; texto: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icone}
      <h2 className="text-lg font-bold text-slate-900">{texto}</h2>
    </div>
  );
}

function Atalho({ to, icone, texto }: { to: string; icone: React.ReactNode; texto: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50"
    >
      {icone} {texto}
    </Link>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
