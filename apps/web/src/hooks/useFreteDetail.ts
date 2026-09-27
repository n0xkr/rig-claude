import { useCallback, useEffect, useState } from 'react';
import type {
  CreateFreteLancamentoInput,
  CreatePagamentoFreteInput,
  Frete,
  FreteLancamento,
  PagamentoFrete,
  SaldoFrete,
  StatusFechamentoFrete,
} from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

/**
 * Hook "controlador" da tela de detalhe/fechamento de um frete (Módulo 3):
 * carrega cabeçalho, saldo (critério #3) e as listas de lançamentos e
 * pagamentos em paralelo, e expõe as ações de mutação (transição de status,
 * lançar adiantamento/desconto/multa, registrar pagamento) já com
 * tratamento de erro RFC 7807 e recarregamento automático após sucesso.
 */
export function useFreteDetail(freteId: string | undefined) {
  const [state, setState] = useState<LoadState>('idle');
  const [frete, setFrete] = useState<Frete | null>(null);
  const [saldo, setSaldo] = useState<SaldoFrete | null>(null);
  const [lancamentos, setLancamentos] = useState<FreteLancamento[]>([]);
  const [pagamentos, setPagamentos] = useState<PagamentoFrete[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [submittingStatus, setSubmittingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [submittingLancamento, setSubmittingLancamento] = useState(false);
  const [lancamentoError, setLancamentoError] = useState<string | null>(null);
  const [submittingPagamento, setSubmittingPagamento] = useState(false);
  const [pagamentoError, setPagamentoError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!freteId) return;
    setState('loading');
    setError(null);
    try {
      const [freteData, saldoData, lancamentosData, pagamentosData] = await Promise.all([
        api.get<Frete>(`/fretes/${freteId}`),
        api.get<SaldoFrete>(`/fretes/${freteId}/saldo`),
        api.get<FreteLancamento[]>(`/fretes/${freteId}/lancamentos`),
        api.get<PagamentoFrete[]>(`/fretes/${freteId}/pagamentos`),
      ]);
      setFrete(freteData);
      setSaldo(saldoData);
      setLancamentos(lancamentosData);
      setPagamentos(pagamentosData);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [freteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = useCallback(
    async (status: StatusFechamentoFrete, observacoes?: string | null): Promise<boolean> => {
      if (!freteId) return false;
      setSubmittingStatus(true);
      setStatusError(null);
      try {
        await api.patch<Frete>(`/fretes/${freteId}/status`, { status, observacoes });
        await load();
        return true;
      } catch (err) {
        setStatusError(
          err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
        );
        return false;
      } finally {
        setSubmittingStatus(false);
      }
    },
    [freteId, load],
  );

  const createLancamento = useCallback(
    async (input: CreateFreteLancamentoInput): Promise<boolean> => {
      if (!freteId) return false;
      setSubmittingLancamento(true);
      setLancamentoError(null);
      try {
        await api.post<FreteLancamento>(`/fretes/${freteId}/lancamentos`, input);
        await load();
        return true;
      } catch (err) {
        setLancamentoError(
          err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
        );
        return false;
      } finally {
        setSubmittingLancamento(false);
      }
    },
    [freteId, load],
  );

  const removeLancamento = useCallback(
    async (lancamentoId: string): Promise<boolean> => {
      if (!freteId) return false;
      setLancamentoError(null);
      try {
        await api.delete(`/fretes/${freteId}/lancamentos/${lancamentoId}`);
        await load();
        return true;
      } catch (err) {
        setLancamentoError(
          err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
        );
        return false;
      }
    },
    [freteId, load],
  );

  const createPagamento = useCallback(
    async (input: CreatePagamentoFreteInput): Promise<boolean> => {
      if (!freteId) return false;
      setSubmittingPagamento(true);
      setPagamentoError(null);
      try {
        await api.post<PagamentoFrete>(`/fretes/${freteId}/pagamentos`, input);
        await load();
        return true;
      } catch (err) {
        setPagamentoError(
          err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
        );
        return false;
      } finally {
        setSubmittingPagamento(false);
      }
    },
    [freteId, load],
  );

  return {
    state,
    frete,
    saldo,
    lancamentos,
    pagamentos,
    error,
    reload: load,
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
  };
}
