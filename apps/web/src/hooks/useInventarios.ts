import { useCallback, useEffect, useState } from 'react';
import type {
  ContarInventarioItemInput,
  CreateInventarioInput,
  Inventario,
  InventarioDetalhe,
} from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

interface ListResponse {
  data: Inventario[];
  nextCursor: string | null;
}

/** Lista de inventários/contagens físicas (Módulo 5, WMS — Controle de Inventário). */
export function useInventariosList() {
  const [state, setState] = useState<LoadState>('idle');
  const [inventarios, setInventarios] = useState<Inventario[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const result = await api.get<ListResponse>('/wms/inventarios?limit=50');
      setInventarios(result.data);
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

  return { state, inventarios, error, reload: load };
}

export function useInventarioDetail(id: string | undefined) {
  const [state, setState] = useState<LoadState>('idle');
  const [inventario, setInventario] = useState<InventarioDetalhe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setState('loading');
    setError(null);
    try {
      const data = await api.get<InventarioDetalhe>(`/wms/inventarios/${id}`);
      setInventario(data);
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

  return { state, inventario, error, reload: load };
}

export function useCreateInventario() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateInventarioInput) => {
    setSubmitting(true);
    setError(null);
    try {
      return await api.post<InventarioDetalhe>('/wms/inventarios', input);
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

/** Ações do fluxo de inventário: iniciar contagem, contar item, reconciliar (ADMIN/SUPERADMIN), encerrar. */
export function useInventarioWorkflow() {
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

  const iniciarContagem = useCallback(
    (id: string) => run(() => api.post<Inventario>(`/wms/inventarios/${id}/iniciar-contagem`)),
    [run],
  );
  const contarItem = useCallback(
    (id: string, input: ContarInventarioItemInput) =>
      run(() => api.patch(`/wms/inventarios/${id}/contagem`, input)),
    [run],
  );
  const reconciliar = useCallback(
    (id: string) => run(() => api.post<InventarioDetalhe>(`/wms/inventarios/${id}/reconciliar`)),
    [run],
  );
  const encerrar = useCallback(
    (id: string) => run(() => api.post<Inventario>(`/wms/inventarios/${id}/encerrar`)),
    [run],
  );

  return { iniciarContagem, contarItem, reconciliar, encerrar, submitting, error };
}
