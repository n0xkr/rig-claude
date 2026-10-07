import { useCallback, useEffect, useState } from 'react';
import type { CreateManutencaoVeiculoInput, ManutencaoVeiculo } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import { queueCreateManutencaoVeiculo } from '../offline/syncManager.js';
import type { LoadState } from './useViagens.js';

interface ListResponse {
  data: ManutencaoVeiculo[];
  nextCursor: string | null;
}

/** Lista de manutenções de veículo (Módulo 4, Controle de Frota), com filtro opcional por veículo. */
export function useManutencoesList(veiculoId?: string) {
  const [state, setState] = useState<LoadState>('idle');
  const [manutencoes, setManutencoes] = useState<ManutencaoVeiculo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      // A API pagina (padrão 20): pede o máximo para a lista não esconder manutenções além da primeira página.
      const query = veiculoId ? `?limit=200&veiculoId=${veiculoId}` : '?limit=200';
      const result = await api.get<ListResponse>(`/frota/manutencoes${query}`);
      setManutencoes(result.data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [veiculoId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, manutencoes, error, reload: load };
}

/** Detalhe de uma manutenção específica. */
export function useManutencaoDetail(id: string | undefined) {
  const [state, setState] = useState<LoadState>('idle');
  const [manutencao, setManutencao] = useState<ManutencaoVeiculo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setState('loading');
    setError(null);
    try {
      const data = await api.get<ManutencaoVeiculo>(`/frota/manutencoes/${id}`);
      setManutencao(data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, manutencao, error, reload: load };
}

/** Registra uma manutenção de veículo, com fila offline-first. */
export function useCreateManutencao() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (input: CreateManutencaoVeiculoInput): Promise<{ queued: boolean }> => {
      setSubmitting(true);
      setError(null);
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          await queueCreateManutencaoVeiculo(input);
          return { queued: true };
        }
        await api.post<ManutencaoVeiculo>('/frota/manutencoes', input);
        return { queued: false };
      } catch (err) {
        if (err instanceof TypeError) {
          await queueCreateManutencaoVeiculo(input);
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

  return { create, submitting, error };
}

/** Exclui (soft delete) uma manutenção — sempre online (correção administrativa, sem fila offline). */
export function useDeleteManutencao() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(async (id: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await api.delete(`/frota/manutencoes/${id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { remove, submitting, error };
}
