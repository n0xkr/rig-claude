import { useState } from 'react';
import type { StatusViagem, Viagem } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';

/**
 * Dispara uma transição de status da viagem (Módulo 2, `PATCH
 * /viagens/:id/status`). Bug/gap real encontrado nesta sessão: a API
 * sempre teve essa rota (com a máquina de estados completa,
 * `TRANSICOES_STATUS_VIAGEM`), mas nenhuma tela chamava-a — a linha do
 * tempo em `ViagemDetailPage` só LIA o histórico, sem nenhum controle para
 * de fato mudar o status. Este hook fecha esse gap.
 */
export function useChangeViagemStatus(viagemId: string | undefined) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(next: StatusViagem, observacoes?: string): Promise<boolean> {
    if (!viagemId) return false;
    setSubmitting(true);
    setError(null);
    try {
      await api.patch<Viagem>(`/viagens/${viagemId}/status`, { status: next, observacoes });
      return true;
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return { changeStatus, submitting, error };
}
