import { useCallback, useEffect, useState } from 'react';
import type { CreateEventoFronteiraInput, EventoFronteira } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import { queueCreateEventoFronteira } from '../offline/syncManager.js';
import type { LoadState } from './useViagens.js';

/** Lista e registra etapas da travessia de fronteira de uma viagem (Módulo 2, critério #2). */
export function useFronteiraTravessia(viagemId: string | undefined) {
  const [state, setState] = useState<LoadState>('idle');
  const [eventos, setEventos] = useState<EventoFronteira[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!viagemId) return;
    setState('loading');
    setError(null);
    try {
      const data = await api.get<EventoFronteira[]>(`/viagens/${viagemId}/fronteira/eventos`);
      setEventos(data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [viagemId]);

  useEffect(() => {
    void load();
  }, [load]);

  const registrarEtapa = useCallback(
    async (input: Omit<CreateEventoFronteiraInput, 'viagem_id'>): Promise<{ queued: boolean }> => {
      if (!viagemId) throw new Error('viagemId ausente');
      setSubmitting(true);
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          await queueCreateEventoFronteira(viagemId, input);
          return { queued: true };
        }
        await api.post(`/viagens/${viagemId}/fronteira/eventos`, input);
        await load();
        return { queued: false };
      } catch (err) {
        if (err instanceof TypeError) {
          await queueCreateEventoFronteira(viagemId, input);
          return { queued: true };
        }
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [viagemId, load],
  );

  return { state, eventos, error, reload: load, registrarEtapa, submitting };
}
