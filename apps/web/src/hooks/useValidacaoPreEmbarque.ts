import { useCallback, useState } from 'react';
import type { ResultadoValidacaoPreEmbarque, ValidarPreEmbarqueInput } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';

/** Dispara e mantém o resultado do cross-check de validação pré-embarque (Módulo 2, critério #3). */
export function useValidacaoPreEmbarque(viagemId: string | undefined) {
  const [resultado, setResultado] = useState<ResultadoValidacaoPreEmbarque | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validar = useCallback(
    async (input: ValidarPreEmbarqueInput) => {
      if (!viagemId) return;
      setSubmitting(true);
      setError(null);
      try {
        const data = await api.post<ResultadoValidacaoPreEmbarque>(
          `/viagens/${viagemId}/validacao-pre-embarque`,
          input,
        );
        setResultado(data);
      } catch (err) {
        setError(
          err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
        );
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [viagemId],
  );

  return { resultado, submitting, error, validar };
}
