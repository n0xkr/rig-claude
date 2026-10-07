import { useCallback, useEffect, useState } from 'react';
import type {
  AddRecebimentoItemInput,
  ConferirRecebimentoItemInput,
  CreateRecebimentoInput,
  Recebimento,
  RecebimentoDetalhe,
  UpdateRecebimentoItemInput,
} from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

interface ListResponse {
  data: Recebimento[];
  nextCursor: string | null;
}

/** Lista de recebimentos (Módulo 5, WMS — Recebimento e Conferência). */
export function useRecebimentosList() {
  const [state, setState] = useState<LoadState>('idle');
  const [recebimentos, setRecebimentos] = useState<Recebimento[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const result = await api.get<ListResponse>('/wms/recebimentos?limit=50');
      setRecebimentos(result.data);
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

  return { state, recebimentos, error, reload: load };
}

export function useRecebimentoDetail(id: string | undefined) {
  const [state, setState] = useState<LoadState>('idle');
  const [recebimento, setRecebimento] = useState<RecebimentoDetalhe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setState('loading');
    setError(null);
    try {
      const data = await api.get<RecebimentoDetalhe>(`/wms/recebimentos/${id}`);
      setRecebimento(data);
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

  return { state, recebimento, error, reload: load };
}

export function useCreateRecebimento() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateRecebimentoInput) => {
    setSubmitting(true);
    setError(null);
    try {
      return await api.post<RecebimentoDetalhe>('/wms/recebimentos', input);
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

/** Gestão do checklist de entrada: adicionar/editar/remover itens enquanto o recebimento está AGUARDANDO. */
export function useRecebimentoItens() {
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

  const addItem = useCallback(
    (recebimentoId: string, input: AddRecebimentoItemInput) =>
      run(() => api.post<RecebimentoDetalhe>(`/wms/recebimentos/${recebimentoId}/itens`, input)),
    [run],
  );

  const updateItem = useCallback(
    (recebimentoId: string, itemId: string, input: UpdateRecebimentoItemInput) =>
      run(() =>
        api.patch<RecebimentoDetalhe>(`/wms/recebimentos/${recebimentoId}/itens/${itemId}`, input),
      ),
    [run],
  );

  const removeItem = useCallback(
    (recebimentoId: string, itemId: string) =>
      run(() =>
        api.delete<RecebimentoDetalhe>(`/wms/recebimentos/${recebimentoId}/itens/${itemId}`),
      ),
    [run],
  );

  return { addItem, updateItem, removeItem, submitting, error };
}

/** Ações do fluxo de conferência: iniciar, conferir item, concluir. */
export function useRecebimentoWorkflow() {
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

  const iniciarConferencia = useCallback(
    (id: string) => run(() => api.post<Recebimento>(`/wms/recebimentos/${id}/iniciar-conferencia`)),
    [run],
  );

  const conferirItem = useCallback(
    (recebimentoId: string, itemId: string, input: ConferirRecebimentoItemInput) =>
      run(() => api.patch(`/wms/recebimentos/${recebimentoId}/itens/${itemId}/conferir`, input)),
    [run],
  );

  const concluirConferencia = useCallback(
    (id: string) => run(() => api.post<RecebimentoDetalhe>(`/wms/recebimentos/${id}/concluir`)),
    [run],
  );

  return { iniciarConferencia, conferirItem, concluirConferencia, submitting, error };
}
