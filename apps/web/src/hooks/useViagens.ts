import { useCallback, useEffect, useState } from 'react';
import type { Viagem, CreateViagemInput } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import { queueCreateViagem } from '../offline/syncManager.js';

interface ListResponse {
  data: Viagem[];
  nextCursor: string | null;
}

export type LoadState = 'idle' | 'loading' | 'success' | 'error';

export function useViagensList(status?: string) {
  const [state, setState] = useState<LoadState>('idle');
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const query = status ? `?status=${status}` : '';
      const result = await api.get<ListResponse>(`/viagens${query}`);
      setViagens(result.data);
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

  return { state, viagens, error, reload: load };
}

export function useCreateViagem() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateViagemInput): Promise<{ queued: boolean }> => {
    setSubmitting(true);
    setError(null);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await queueCreateViagem(input);
        return { queued: true };
      }
      await api.post<Viagem>('/viagens', input);
      return { queued: false };
    } catch (err) {
      if (err instanceof TypeError) {
        // Falha de rede (fetch lançou antes de obter resposta): enfileira offline.
        await queueCreateViagem(input);
        return { queued: true };
      }
      // Erros de validação (422) trazem os campos inválidos em `problem.errors`.
      const campos =
        err instanceof ApiError && err.problem.errors
          ? Object.entries(err.problem.errors)
              .map(([campo, msgs]) => `${campo}: ${msgs.join(', ')}`)
              .join('; ')
          : '';
      setError(
        err instanceof ApiError
          ? `${err.problem.detail ?? err.problem.title}${campos ? ` (${campos})` : ''}`
          : 'Erro inesperado',
      );
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { create, submitting, error };
}
