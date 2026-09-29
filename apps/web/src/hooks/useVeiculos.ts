import { useCallback, useEffect, useState } from 'react';
import type { Veiculo } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

interface ListResponse {
  data: Veiculo[];
  nextCursor: string | null;
}

/** Lista simples de veículos (Módulo 1), usada apenas para seletores/dropdowns do Módulo 4 (manutenção, quilometragem) — nenhuma tela de CRUD de veículo é criada aqui. */
export function useVeiculosList() {
  const [state, setState] = useState<LoadState>('idle');
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const result = await api.get<ListResponse>('/veiculos?limit=1000');
      setVeiculos(result.data);
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

  return { state, veiculos, error, reload: load };
}
