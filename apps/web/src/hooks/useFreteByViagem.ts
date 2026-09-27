import { useCallback, useEffect, useState } from 'react';
import type { Frete } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';

export type FreteByViagemState = 'idle' | 'loading' | 'success' | 'empty' | 'error';

/**
 * Resolve o frete contratado de uma viagem (relação 1:1). Distingue o caso
 * "ainda não existe frete cadastrado" (`empty`, a partir de um 404) de um
 * erro real de rede/servidor (`error`), para a tela de detalhe da viagem
 * poder oferecer a ação de registrar o frete em vez de um card de erro.
 */
export function useFreteByViagem(viagemId: string | undefined) {
  const [state, setState] = useState<FreteByViagemState>('idle');
  const [frete, setFrete] = useState<Frete | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!viagemId) return;
    setState('loading');
    setError(null);
    try {
      const data = await api.get<Frete>(`/viagens/${viagemId}/frete`);
      setFrete(data);
      setState('success');
    } catch (err) {
      if (err instanceof ApiError && err.problem.status === 404) {
        setFrete(null);
        setState('empty');
        return;
      }
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [viagemId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, frete, error, reload: load };
}
