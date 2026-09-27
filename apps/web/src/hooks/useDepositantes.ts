import { useCallback, useEffect, useState } from 'react';
import type { CreateDepositanteInput, Depositante, UpdateDepositanteInput } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import { queueCreateDepositante } from '../offline/syncManager.js';
import type { LoadState } from './useViagens.js';

interface ListResponse {
  data: Depositante[];
  nextCursor: string | null;
}

/** Lista de depositantes (Módulo 5, WMS — clientes do Armazém Geral). */
export function useDepositantesList() {
  const [state, setState] = useState<LoadState>('idle');
  const [depositantes, setDepositantes] = useState<Depositante[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const result = await api.get<ListResponse>('/wms/depositantes?limit=100');
      setDepositantes(result.data);
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

  return { state, depositantes, error, reload: load };
}

export function useDepositanteDetail(id: string | undefined) {
  const [state, setState] = useState<LoadState>('idle');
  const [depositante, setDepositante] = useState<Depositante | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setState('loading');
    setError(null);
    try {
      const data = await api.get<Depositante>(`/wms/depositantes/${id}`);
      setDepositante(data);
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

  return { state, depositante, error, reload: load };
}

/** Cadastra um depositante, com fila offline-first (extensão da fila existente). */
export function useCreateDepositante() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (input: CreateDepositanteInput): Promise<{ queued: boolean }> => {
      setSubmitting(true);
      setError(null);
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          await queueCreateDepositante(input);
          return { queued: true };
        }
        await api.post<Depositante>('/wms/depositantes', input);
        return { queued: false };
      } catch (err) {
        if (err instanceof TypeError) {
          await queueCreateDepositante(input);
          return { queued: true };
        }
        setError(
          err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
        );
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  return { create, submitting, error };
}

export function useUpdateDepositante() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(async (id: string, input: UpdateDepositanteInput) => {
    setSubmitting(true);
    setError(null);
    try {
      return await api.patch<Depositante>(`/wms/depositantes/${id}`, input);
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { update, submitting, error };
}
