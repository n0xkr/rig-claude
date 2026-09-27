import { useCallback, useEffect, useState } from 'react';
import type { Motorista } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

interface ListResponse {
  data: Motorista[];
  nextCursor: string | null;
}

/** Lista simples de motoristas (Módulo 1), usada apenas para seletores/dropdowns do Módulo 4 (registro de jornada) — nenhuma tela de CRUD de motorista é criada aqui. */
export function useMotoristasList() {
  const [state, setState] = useState<LoadState>('idle');
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const result = await api.get<ListResponse>('/motoristas?limit=100');
      setMotoristas(result.data);
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

  return { state, motoristas, error, reload: load };
}
