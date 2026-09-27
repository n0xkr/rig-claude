import { useCallback, useState } from 'react';
import type { AtualizarQuilometragemViagemInput } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import { queueUpdateQuilometragemViagem } from '../offline/syncManager.js';

/** Registra km rodado/vazio e consumo de combustível de uma viagem já concluída (colunas próprias do Módulo 4 em `viagens`), com fila offline-first. */
export function useAtualizarQuilometragem() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atualizar = useCallback(
    async (
      viagemId: string,
      input: AtualizarQuilometragemViagemInput,
    ): Promise<{ queued: boolean }> => {
      setSubmitting(true);
      setError(null);
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          await queueUpdateQuilometragemViagem(viagemId, input);
          return { queued: true };
        }
        await api.patch(`/frota/viagens/${viagemId}/quilometragem`, input);
        return { queued: false };
      } catch (err) {
        if (err instanceof TypeError) {
          await queueUpdateQuilometragemViagem(viagemId, input);
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

  return { atualizar, submitting, error };
}
