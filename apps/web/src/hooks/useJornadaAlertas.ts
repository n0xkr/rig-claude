import { useCallback, useEffect, useState } from 'react';
import type { AlertaConformidadeMotorista } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

/** Painel de alertas de conformidade ADI 5322 entre motoristas ativos (Módulo 4, "identificação de excessos e alertas imediatos"). */
export function useJornadaAlertas() {
  const [state, setState] = useState<LoadState>('idle');
  const [alertas, setAlertas] = useState<AlertaConformidadeMotorista[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const data = await api.get<AlertaConformidadeMotorista[]>('/jornada/alertas');
      setAlertas(data);
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

  return { state, alertas, error, reload: load };
}
