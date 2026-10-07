import { useCallback, useEffect, useState } from 'react';
import type { Avaria, CreateAvariaInput } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import { queueCreateAvaria } from '../offline/syncManager.js';
import type { LoadState } from './useViagens.js';

interface ListResponse {
  data: Avaria[];
  nextCursor: string | null;
}

/** Lista de avarias (Módulo 5, WMS — Controle de avarias). */
export function useAvariasList() {
  const [state, setState] = useState<LoadState>('idle');
  const [avarias, setAvarias] = useState<Avaria[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const result = await api.get<ListResponse>('/wms/avarias?limit=50');
      setAvarias(result.data);
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

  return { state, avarias, error, reload: load };
}

/** Registra uma avaria, com fila offline-first (extensão da fila existente). */
export function useCreateAvaria() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateAvariaInput): Promise<{ queued: boolean }> => {
    setSubmitting(true);
    setError(null);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await queueCreateAvaria(input);
        return { queued: true };
      }
      await api.post<Avaria>('/wms/avarias', input);
      return { queued: false };
    } catch (err) {
      if (err instanceof TypeError) {
        await queueCreateAvaria(input);
        return { queued: true };
      }
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
