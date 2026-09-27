import { useCallback, useEffect, useState } from 'react';
import type {
  CreateExpedicaoInput,
  Expedicao,
  ExpedicaoDetalhe,
  SepararExpedicaoItemInput,
} from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

interface ListResponse {
  data: Expedicao[];
  nextCursor: string | null;
}

/** Lista de expedições (Módulo 5, WMS — Separação/Reembalagem/Etiquetagem/Cross-docking/Expedição). */
export function useExpedicoesList() {
  const [state, setState] = useState<LoadState>('idle');
  const [expedicoes, setExpedicoes] = useState<Expedicao[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const result = await api.get<ListResponse>('/wms/expedicoes?limit=50');
      setExpedicoes(result.data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, expedicoes, error, reload: load };
}

export function useExpedicaoDetail(id: string | undefined) {
  const [state, setState] = useState<LoadState>('idle');
  const [expedicao, setExpedicao] = useState<ExpedicaoDetalhe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setState('loading');
    setError(null);
    try {
      const data = await api.get<ExpedicaoDetalhe>(`/wms/expedicoes/${id}`);
      setExpedicao(data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, expedicao, error, reload: load };
}

export function useCreateExpedicao() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateExpedicaoInput) => {
    setSubmitting(true);
    setError(null);
    try {
      return await api.post<ExpedicaoDetalhe>('/wms/expedicoes', input);
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { create, submitting, error };
}

/** Ações do fluxo de separação/reembalagem/etiquetagem/expedição. */
export function useExpedicaoWorkflow() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    setSubmitting(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const iniciarSeparacao = useCallback(
    (id: string) => run(() => api.post<Expedicao>(`/wms/expedicoes/${id}/iniciar-separacao`)),
    [run],
  );
  const separarItem = useCallback(
    (expedicaoId: string, itemId: string, input: SepararExpedicaoItemInput) =>
      run(() => api.patch(`/wms/expedicoes/${expedicaoId}/itens/${itemId}/separar`, input)),
    [run],
  );
  const marcarReembalagemEtiquetagem = useCallback(
    (expedicaoId: string, itemId: string, flags: { reembalado?: boolean; etiquetado?: boolean }) =>
      run(() =>
        api.patch(`/wms/expedicoes/${expedicaoId}/itens/${itemId}/reembalagem-etiquetagem`, flags),
      ),
    [run],
  );
  const concluirSeparacao = useCallback(
    (id: string) => run(() => api.post<Expedicao>(`/wms/expedicoes/${id}/concluir-separacao`)),
    [run],
  );
  const marcarProntaExpedicao = useCallback(
    (id: string) => run(() => api.post<Expedicao>(`/wms/expedicoes/${id}/pronta-expedicao`)),
    [run],
  );
  const expedir = useCallback(
    (id: string) => run(() => api.post<ExpedicaoDetalhe>(`/wms/expedicoes/${id}/expedir`)),
    [run],
  );
  const cancelar = useCallback(
    (id: string) => run(() => api.post<Expedicao>(`/wms/expedicoes/${id}/cancelar`)),
    [run],
  );

  return {
    iniciarSeparacao,
    separarItem,
    marcarReembalagemEtiquetagem,
    concluirSeparacao,
    marcarProntaExpedicao,
    expedir,
    cancelar,
    submitting,
    error,
  };
}
