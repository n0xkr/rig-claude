import { useCallback, useState } from 'react';
import type {
  CommitImportacaoResult,
  ImportDataset,
  ImportTarget,
  OrigemImportacao,
  ValidarImportacaoResult,
} from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';

/** Ações do Módulo 9 (Importação de dados): validar planilha, importar, listar histórico. */
export function useImportacaoActions() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    setSubmitting(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const validar = useCallback(
    (target: ImportTarget, linhas: Array<Record<string, unknown>>) =>
      run(() =>
        api.post<ValidarImportacaoResult>('/importacoes/validar', { target, linhas }),
      ),
    [run],
  );

  const importar = useCallback(
    (
      target: ImportTarget,
      nome: string,
      origem: OrigemImportacao,
      linhas: Array<Record<string, unknown>>,
    ) =>
      run(() =>
        api.post<CommitImportacaoResult>('/importacoes', { target, nome, origem, linhas }),
      ),
    [run],
  );

  const listarHistorico = useCallback(() => run(() => api.get<ImportDataset[]>('/importacoes')), [run]);

  return { validar, importar, listarHistorico, submitting, error };
}
