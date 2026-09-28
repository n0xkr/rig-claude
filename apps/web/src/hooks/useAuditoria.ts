import { useCallback, useEffect, useState } from 'react';
import type { AuditLog } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

interface ListResponse {
  data: AuditLog[];
  nextCursor: string | null;
}

/** Trilha de auditoria (critério #21) — leitura para ADMIN/SUPERADMIN. */
export function useAuditoriaList(entity?: string) {
  const [state, setState] = useState<LoadState>('idle');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor?: string) => {
      setState('loading');
      setError(null);
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (entity) params.set('entity', entity);
        if (cursor) params.set('cursor', cursor);
        const result = await api.get<ListResponse>(`/auditoria?${params.toString()}`);
        setLogs((prev) => (cursor ? [...prev, ...result.data] : result.data));
        setNextCursor(result.nextCursor);
        setState('success');
      } catch (err) {
        setError(
          err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
        );
        setState('error');
      }
    },
    [entity],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return {
    state,
    logs,
    error,
    hasMore: nextCursor !== null,
    loadMore: () => nextCursor && load(nextCursor),
    reload: () => load(),
  };
}
