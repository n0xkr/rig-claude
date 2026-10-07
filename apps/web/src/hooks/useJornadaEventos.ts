import { useCallback, useEffect, useState } from 'react';
import type { CreateRegistroJornadaInput, RegistroJornada } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import { queueCreateRegistroJornada } from '../offline/syncManager.js';
import type { LoadState } from './useViagens.js';

/** Registra um evento de jornada (Módulo 4, Controle de Jornada — ADI 5322), com fila offline-first — essencial em fronteira/estrada sem sinal. */
export function useRegistrarJornadaEvento() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registrar = useCallback(
    async (input: CreateRegistroJornadaInput): Promise<{ queued: boolean }> => {
      setSubmitting(true);
      setError(null);
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          await queueCreateRegistroJornada(input);
          return { queued: true };
        }
        await api.post<RegistroJornada>('/jornada/eventos', input);
        return { queued: false };
      } catch (err) {
        if (err instanceof TypeError) {
          await queueCreateRegistroJornada(input);
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

  return { registrar, submitting, error };
}

/** Lista bruta de eventos de jornada de um motorista (log contínuo, imutável). */
export function useJornadaEventosByMotorista(motoristaId: string | undefined) {
  const [state, setState] = useState<LoadState>('idle');
  const [eventos, setEventos] = useState<RegistroJornada[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!motoristaId) return;
    setState('loading');
    setError(null);
    try {
      const data = await api.get<RegistroJornada[]>(`/jornada/motoristas/${motoristaId}/eventos`);
      setEventos(data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [motoristaId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, eventos, error, reload: load };
}
