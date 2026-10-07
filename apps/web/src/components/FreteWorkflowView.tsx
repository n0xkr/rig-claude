import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ClipboardList,
  History,
  Receipt,
  XCircle,
} from 'lucide-react';
import type {
  StatusFechamentoFrete,
  TipoLancamentoFrete,
  StatusPagamentoFrete,
} from '@rigabras/shared';
import {
  PAPEIS_TRANSICAO_FECHAMENTO_FRETE,
  TRANSICOES_STATUS_FECHAMENTO_FRETE,
} from '@rigabras/shared';
import { useFreteDetail } from '../hooks/useFreteDetail.js';
import { useFreteStatusHistory } from '../hooks/useFreteStatusHistory.js';
import { getCurrentUserRole } from '../lib/apiClient.js';
import { formatDateOnly } from '../lib/dateOnly.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from './StateViews.js';
import { FreteStatusBadge } from './StatusBadge.js';

const STATUS_LABEL: Record<StatusFechamentoFrete, string> = {
  ABERTO: 'Aberto',
  EM_CONFERENCIA: 'Em conferência',
  APROVADO: 'Aprovado financeiramente',
  REJEITADO: 'Rejeitado',
  PAGO: 'Pago',
};

const TRANSITION_LABEL: Record<string, string> = {
  ABERTO_EM_CONFERENCIA: 'Enviar para conferência operacional',
  EM_CONFERENCIA_APROVADO: 'Aprovar financeiramente',
  EM_CONFERENCIA_REJEITADO: 'Rejeitar (retrabalho)',
  APROVADO_PAGO: 'Confirmar pagamento',
  APROVADO_REJEITADO: 'Rejeitar aprovação',
  REJEITADO_EM_CONFERENCIA: 'Reencaminhar para conferência',
};

const LANCAMENTO_LABEL: Record<TipoLancamentoFrete, string> = {
  ADIANTAMENTO: 'Adiantamento',
  DESCONTO: 'Desconto',
  MULTA: 'Multa',
};

const PAGAMENTO_STATUS_LABEL: Record<StatusPagamentoFrete, string> = {
  PENDENTE: 'Pendente',
  CONFIRMADO: 'Confirmado',
  CANCELADO: 'Cancelado',
};

function currency(value: number | null | undefined): string {
  if (value == null) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Tela de fechamento da viagem / controle financeiro do frete (Módulo 3):
 * mostra o cabeçalho comercial, o saldo do frete (critério #3), o estágio
 * atual da máquina de estados com as transições disponíveis já filtradas por
 * RBAC (critério #4 — ex: só ADMIN/SUPERADMIN veem "Aprovar
 * financeiramente"/"Confirmar pagamento"), os lançamentos de
 * adiantamento/desconto/multa, o ledger de pagamentos e o histórico de
 * transições. Usada tanto em `/fretes/:id` quanto embutida em
 * `/viagens/:id/frete` depois que o frete já foi criado.
 */
export function FreteWorkflowView({ freteId }: { freteId: string }) {
  const {
    state,
    frete,
    saldo,
    lancamentos,
    pagamentos,
    error,
    reload,
    changeStatus,
    submittingStatus,
    statusError,
    createLancamento,
    submittingLancamento,
    lancamentoError,
    removeLancamento,
    createPagamento,
    submittingPagamento,
    pagamentoError,
  } = useFreteDetail(freteId);
  const { historico, state: historicoState } = useFreteStatusHistory(freteId);
  const role = getCurrentUserRole();

  const [lancTipo, setLancTipo] = useState<TipoLancamentoFrete>('ADIANTAMENTO');
  const [lancValor, setLancValor] = useState('');
  const [lancDescricao, setLancDescricao] = useState('');
  const [pagValor, setPagValor] = useState('');
  const [pagForma, setPagForma] = useState('');
  const [transitionFeedback, setTransitionFeedback] = useState<string | null>(null);

  if (state === 'loading' || state === 'idle') return <LoadingSkeleton rows={4} />;
  if (state === 'error') return <ErrorCard message={error ?? 'Erro'} onRetry={reload} />;
  if (!frete) return null;

  const availableTransitions = TRANSICOES_STATUS_FECHAMENTO_FRETE[frete.status_fechamento];
  const canWriteFinanceiro = role === 'SUPERADMIN' || role === 'ADMIN';

  async function handleTransition(next: StatusFechamentoFrete) {
    setTransitionFeedback(null);
    const ok = await changeStatus(next);
    setTransitionFeedback(ok ? `Status alterado para ${STATUS_LABEL[next]}.` : null);
  }

  return (
    <div>
      <Link
        to={`/viagens/${frete.viagem_id}`}
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para a viagem
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fechamento do frete</h1>
          <p className="text-sm text-slate-500">
            {frete.numero_fatura ? `Fatura ${frete.numero_fatura}` : 'Sem número de fatura'}
          </p>
        </div>
        <FreteStatusBadge status={frete.status_fechamento} />
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 p-6 text-sm sm:grid-cols-3 bg-white shadow-sm">
        <Info label="Valor contratado" value={currency(frete.valor_contratado)} />
        <Info
          label="Retorno do veículo"
          value={frete.retorno_vazio ? 'Vazio' : 'Com carga de retorno (backhaul)'}
        />
        {frete.retorno_vazio ? (
          <Info
            label="Custo estimado (retorno vazio)"
            value={currency(frete.valor_custo_retorno_vazio)}
          />
        ) : (
          <Info label="Valor do frete de retorno" value={currency(frete.valor_frete_retorno)} />
        )}
      </dl>

      {saldo && (
        <div className="mb-8 rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">Saldo do frete</h2>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
            <Info label="Contratado" value={currency(saldo.valor_contratado)} />
            <Info label="Adiantamentos" value={`- ${currency(saldo.total_adiantamentos)}`} />
            <Info label="Descontos" value={`- ${currency(saldo.total_descontos)}`} />
            <Info label="Multas" value={`- ${currency(saldo.total_multas)}`} />
            <Info label="Pago (confirmado)" value={`- ${currency(saldo.total_pago_confirmado)}`} />
          </dl>
          <p className="mt-4 text-lg font-semibold text-slate-900">
            Saldo devido:{' '}
            <span className={saldo.saldo > 0 ? 'text-amber-700' : 'text-emerald-600'}>
              {currency(saldo.saldo)}
            </span>
          </p>
        </div>
      )}

      <div className="mb-8 rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-rigabras-500" />
          <h2 className="text-lg font-bold text-slate-900">Transições de fechamento</h2>
        </div>
        {availableTransitions.length === 0 ? (
          <p className="text-sm text-slate-500">
            Fechamento concluído — nenhuma transição disponível a partir de "
            {STATUS_LABEL[frete.status_fechamento]}".
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {availableTransitions.map((next) => {
              const key = `${frete.status_fechamento}_${next}`;
              const allowedRoles =
                PAPEIS_TRANSICAO_FECHAMENTO_FRETE[frete.status_fechamento][next] ?? [];
              const allowed = role != null && allowedRoles.includes(role);
              return (
                <button
                  key={key}
                  disabled={submittingStatus || !allowed}
                  onClick={() => void handleTransition(next)}
                  title={allowed ? undefined : `Requer um dos papéis: ${allowedRoles.join(', ')}`}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                    next === 'REJEITADO'
                      ? 'border border-red-200 text-red-700 hover:bg-red-100 transition-all duration-200'
                      : 'bg-rigabras-500 text-white hover:opacity-90 transition-all duration-200'
                  }`}
                >
                  {next === 'REJEITADO' ? (
                    <XCircle className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {TRANSITION_LABEL[key] ?? `${frete.status_fechamento} → ${next}`}
                </button>
              );
            })}
          </div>
        )}
        {statusError && <p className="mt-3 text-sm text-red-600">{statusError}</p>}
        {transitionFeedback && (
          <p className="mt-3 text-sm text-emerald-600">{transitionFeedback}</p>
        )}
      </div>

      <div className="mb-8 rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Banknote className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-bold text-slate-900">
            Lançamentos (adiantamentos, descontos, multas)
          </h2>
        </div>

        {canWriteFinanceiro && frete.status_fechamento !== 'PAGO' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createLancamento({
                tipo: lancTipo,
                valor: Number(lancValor),
                descricao: lancDescricao || null,
              }).then((ok) => {
                if (ok) {
                  setLancValor('');
                  setLancDescricao('');
                }
              });
            }}
            className="mb-4 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 p-3 sm:grid-cols-4 bg-white shadow-sm"
          >
            <select
              value={lancTipo}
              onChange={(e) => setLancTipo(e.target.value as TipoLancamentoFrete)}
              className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
            >
              {(Object.keys(LANCAMENTO_LABEL) as TipoLancamentoFrete[]).map((tipo) => (
                <option key={tipo} value={tipo}>
                  {LANCAMENTO_LABEL[tipo]}
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              min={0.01}
              step="0.01"
              placeholder="Valor (R$)"
              value={lancValor}
              onChange={(e) => setLancValor(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-500"
            />
            <input
              placeholder="Descrição (opcional)"
              value={lancDescricao}
              onChange={(e) => setLancDescricao(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 sm:col-span-1"
            />
            <button
              type="submit"
              disabled={submittingLancamento}
              className="rounded-xl bg-rigabras-500 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
            >
              {submittingLancamento ? 'Lançando...' : 'Lançar'}
            </button>
          </form>
        )}
        {lancamentoError && <p className="mb-3 text-sm text-red-600">{lancamentoError}</p>}

        {lancamentos.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum lançamento registrado.</p>
        ) : (
          <ul className="space-y-2">
            {lancamentos.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white shadow-sm"
              >
                <div>
                  <span className="font-medium text-slate-900">{LANCAMENTO_LABEL[l.tipo]}</span>{' '}
                  <span className="text-slate-500">— {currency(l.valor)}</span>
                  {l.descricao && <p className="text-xs text-slate-500">{l.descricao}</p>}
                </div>
                {canWriteFinanceiro && (
                  <button
                    onClick={() => void removeLancamento(l.id)}
                    className="text-xs text-red-600 hover:text-red-700 transition-all duration-200"
                  >
                    Remover
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-8 rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Banknote className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-bold text-slate-900">Pagamentos</h2>
        </div>

        {canWriteFinanceiro && frete.status_fechamento === 'APROVADO' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createPagamento({
                valor_pago: Number(pagValor),
                forma_pagamento: pagForma || null,
                status: 'CONFIRMADO',
              }).then((ok) => {
                if (ok) {
                  setPagValor('');
                  setPagForma('');
                }
              });
            }}
            className="mb-4 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 p-3 sm:grid-cols-3 bg-white shadow-sm"
          >
            <input
              required
              type="number"
              min={0.01}
              step="0.01"
              placeholder="Valor pago (R$)"
              value={pagValor}
              onChange={(e) => setPagValor(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-500"
            />
            <input
              placeholder="Forma de pagamento (opcional)"
              value={pagForma}
              onChange={(e) => setPagForma(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={submittingPagamento}
              className="rounded-xl bg-rigabras-500 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
            >
              {submittingPagamento ? 'Registrando...' : 'Registrar pagamento'}
            </button>
          </form>
        )}
        {frete.status_fechamento !== 'APROVADO' && (
          <p className="mb-3 text-xs text-slate-500">
            Pagamentos só podem ser registrados após a aprovação financeira do frete.
          </p>
        )}
        {pagamentoError && <p className="mb-3 text-sm text-red-600">{pagamentoError}</p>}

        {pagamentos.length === 0 ? (
          <EmptyState
            title="Nenhum pagamento registrado"
            description="Lei 15.485/2026: frete pago em até 30 dias úteis."
          />
        ) : (
          <ul className="space-y-2">
            {pagamentos.map((p) => (
              <li
                key={p.id}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">{currency(p.valor_pago)}</span>
                  <span className="text-xs text-slate-500">{PAGAMENTO_STATUS_LABEL[p.status]}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {p.forma_pagamento ?? 'Forma não informada'}
                  {p.data_pagamento ? ` · ${formatDateOnly(p.data_pagamento)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <History className="h-5 w-5 text-slate-500" />
        <h2 className="text-lg font-bold text-slate-900">Histórico do fechamento</h2>
      </div>
      {historicoState === 'loading' ? (
        <LoadingSkeleton rows={2} />
      ) : historico.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma transição registrada ainda.</p>
      ) : (
        <ol className="space-y-3 border-l border-slate-200 pl-4">
          {historico.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-rigabras-500" />
              <div className="flex flex-wrap items-center gap-2">
                {h.status_anterior && (
                  <span className="text-xs text-slate-500">
                    {STATUS_LABEL[h.status_anterior]} →
                  </span>
                )}
                <FreteStatusBadge status={h.status_novo} />
                <span className="text-xs text-slate-500">
                  {h.created_at ? new Date(h.created_at).toLocaleString('pt-BR') : ''}
                </span>
              </div>
              {h.observacoes && <p className="mt-1 text-sm text-slate-500">{h.observacoes}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
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
