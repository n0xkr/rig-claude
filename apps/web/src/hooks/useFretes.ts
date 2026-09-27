import { useCallback, useEffect, useState } from 'react';
import type { CreateFreteInput, Frete, UpdateFreteInput } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import { queueCreateFrete, queueUpdateFrete } from '../offline/syncManager.js';
import type { LoadState } from './useViagens.js';

interface ListResponse {
  data: Frete[];
  nextCursor: string | null;
}

/** Lista de fretes (Módulo 3), com filtro opcional por status de fechamento. */
export function useFretesList(status?: string) {
  const [state, setState] = useState<LoadState>('idle');
  const [fretes, setFretes] = useState<Frete[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const query = status ? `?status=${status}` : '';
      const result = await api.get<ListResponse>(`/fretes${query}`);
      setFretes(result.data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, fretes, error, reload: load };
}

/** Cria o frete contratado de uma viagem (critério #1), com fila offline-first. */
export function useCreateFrete() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateFreteInput): Promise<{ queued: boolean }> => {
    setSubmitting(true);
    setError(null);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await queueCreateFrete(input.viagem_id, input);
        return { queued: true };
      }
      await api.post<Frete>('/fretes', input);
      return { queued: false };
    } catch (err) {
      if (err instanceof TypeError) {
        await queueCreateFrete(input.viagem_id, input);
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

/** Edita o cabeçalho comercial de um frete (permitido apenas antes de aprovado/pago). */
export function useUpdateFrete() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(
    async (freteId: string, input: UpdateFreteInput): Promise<{ queued: boolean }> => {
      setSubmitting(true);
      setError(null);
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          await queueUpdateFrete(freteId, input);
          return { queued: true };
        }
        await api.patch<Frete>(`/fretes/${freteId}`, input);
        return { queued: false };
      } catch (err) {
        if (err instanceof TypeError) {
          await queueUpdateFrete(freteId, input);
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

  return { update, submitting, error };
}
