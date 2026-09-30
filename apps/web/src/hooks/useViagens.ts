import { useCallback, useEffect, useRef, useState } from 'react';
import type { Viagem, CreateViagemInput } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import { queueCreateViagem } from '../offline/syncManager.js';

interface ListResponse {
  data: Viagem[];
  nextCursor: string | null;
}

export type LoadState = 'idle' | 'loading' | 'success' | 'error';

/** Tamanho de página e teto de páginas ao carregar a lista completa (200 x 10 = 2.000 viagens). */
const PAGE_LIMIT = 200;
const MAX_PAGES = 10;

/**
 * Carrega TODAS as viagens (seguindo `nextCursor`), pois o painel agrega sobre o
 * conjunto inteiro; sem a paginação a API devolve só as 20 mais recentes.
 */
export function useViagensList(status?: string) {
  const [state, setState] = useState<LoadState>('idle');
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setState('loading');
    setError(null);
    try {
      const all: Viagem[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
        if (status) params.set('status', status);
        if (cursor) params.set('cursor', cursor);
        const result: ListResponse = await api.get<ListResponse>(`/viagens?${params.toString()}`);
        all.push(...result.data);
        cursor = result.nextCursor;
        pages += 1;
      } while (cursor && pages < MAX_PAGES);
      if (mine !== seq.current) return; // resposta obsoleta (filtro mudou / recarga mais nova)
      setViagens(all);
      setTruncated(cursor !== null);
      setState('success');
    } catch (err) {
      if (mine !== seq.current) return;
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, viagens, error, truncated, reload: load };
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
