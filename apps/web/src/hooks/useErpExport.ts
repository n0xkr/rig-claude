import { useCallback, useState } from 'react';
import type { ErpEstoqueRecord, ErpFinanceiroRecord } from '@rigabras/shared';
import { api, apiFetchBlob, ApiError } from '../lib/apiClient.js';

export type ErpExportTipo = 'financeiro' | 'estoque';

interface Periodo {
  inicio: string;
  fim: string;
}

/** Módulo 7 (Integração ERP): consulta (formato JSON, para visualização) e download (CSV) das exportações financeira e de estoque. */
export function useErpExport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visualizar = useCallback(
    async (
      tipo: ErpExportTipo,
      periodo: Periodo,
    ): Promise<Array<ErpFinanceiroRecord | ErpEstoqueRecord>> => {
      setLoading(true);
      setError(null);
      try {
        return await api.get<Array<ErpFinanceiroRecord | ErpEstoqueRecord>>(
          `/erp-export/${tipo}?inicio=${periodo.inicio}&fim=${periodo.fim}&formato=json`,
        );
      } catch (err) {
        setError(
          err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const baixarCsv = useCallback(async (tipo: ErpExportTipo, periodo: Periodo): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const { blob, filename } = await apiFetchBlob(
        `/erp-export/${tipo}?inicio=${periodo.inicio}&fim=${periodo.fim}&formato=csv`,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? `erp-${tipo}-${periodo.inicio}_a_${periodo.fim}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { visualizar, baixarCsv, loading, error };
}
