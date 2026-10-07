import { useCallback, useEffect, useState } from 'react';
import type { CreateEnderecoArmazemInput, EnderecoArmazem } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

interface ArmazemRow {
  id: string;
  nome: string;
  area_m2: number | null;
}

/** Lista de armazéns físicos (migration 0001) — usada para o seletor do mapa de ocupação. */
export function useArmazensList() {
  const [state, setState] = useState<LoadState>('idle');
  const [armazens, setArmazens] = useState<ArmazemRow[]>([]);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const result = await api.get<{ data: ArmazemRow[] }>('/wms/armazens');
      setArmazens(result.data);
      setState('success');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, armazens, reload: load };
}

/** Mapa de ocupação do armazém (Módulo 5, WMS): todos os endereços de um armazém, com status LIVRE/OCUPADO/BLOQUEADO. */
export function useEnderecosList(armazemId?: string) {
  const [state, setState] = useState<LoadState>('idle');
  const [enderecos, setEnderecos] = useState<EnderecoArmazem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!armazemId) return;
    setState('loading');
    setError(null);
    try {
      const result = await api.get<{ data: EnderecoArmazem[] }>(
        `/wms/enderecos?armazemId=${armazemId}&limit=1000`,
      );
      setEnderecos(result.data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [armazemId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, enderecos, error, reload: load };
}

export function useCreateEndereco() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateEnderecoArmazemInput) => {
    setSubmitting(true);
    setError(null);
    try {
      return await api.post<EnderecoArmazem>('/wms/enderecos', input);
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { create, submitting, error };
}

export function useUpdateEnderecoStatus() {
  const [submitting, setSubmitting] = useState(false);

  const updateStatus = useCallback(async (id: string, status: EnderecoArmazem['status']) => {
    setSubmitting(true);
    try {
      return await api.patch<EnderecoArmazem>(`/wms/enderecos/${id}`, { status });
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { updateStatus, submitting };
}
