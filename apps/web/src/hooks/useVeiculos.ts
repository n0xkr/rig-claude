import { useCallback, useEffect, useState } from 'react';
import type { CreateVeiculoInput, UpdateVeiculoInput, Veiculo } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

interface ListResponse {
  data: Veiculo[];
  nextCursor: string | null;
}

/** Lista de veículos da frota (Módulo 1 — cadastro de veículos do TMS). */
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

/** Detalhe de um veículo (edição em /frota/veiculos/:id). */
export function useVeiculoDetail(id?: string) {
  const [state, setState] = useState<LoadState>('idle');
  const [veiculo, setVeiculo] = useState<Veiculo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setState('loading');
    setError(null);
    try {
      setVeiculo(await api.get<Veiculo>(`/veiculos/${id}`));
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

  return { state, veiculo, error, reload: load };
}

export function useCreateVeiculo() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateVeiculoInput) => {
    setSubmitting(true);
    setError(null);
    try {
      return await api.post<Veiculo>('/veiculos', input);
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

export function useUpdateVeiculo() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(async (id: string, input: UpdateVeiculoInput) => {
    setSubmitting(true);
    setError(null);
    try {
      return await api.patch<Veiculo>(`/veiculos/${id}`, input);
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { update, submitting, error };
}

export function useDeleteVeiculo() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(async (id: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await api.delete(`/veiculos/${id}`);
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
