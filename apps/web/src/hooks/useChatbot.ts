import { useCallback, useState } from 'react';
import type { RespostaChatbot } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';

/** RIGABRAS AI (Módulo 10) — pergunta em linguagem natural, resposta baseada em snapshot ao vivo. */
export function useChatbot() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perguntar = useCallback(async (pergunta: string) => {
    setEnviando(true);
    setError(null);
    try {
      return await api.post<RespostaChatbot>('/rigabras-ai/perguntar', { pergunta });
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      throw err;
    } finally {
      setEnviando(false);
    }
  }, []);

  return { perguntar, enviando, error };
}
