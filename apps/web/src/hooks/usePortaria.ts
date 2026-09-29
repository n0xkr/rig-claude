import { useCallback, useEffect, useState } from 'react';
import type {
  CreatePortariaDocumentoInput,
  CreatePortariaEntradaInput,
  CreatePortariaSaidaInput,
  OrdemServico,
  PortariaDocumento,
  PortariaDocumentoDownloadUrl,
  PortariaDocumentoUploadUrl,
  PortariaEntrada,
  PortariaEntradaDetalhe,
  PortariaSaida,
  StatusPortariaEntrada,
  TipoDocumentoPortaria,
  Viagem,
} from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import { uploadPortariaDocumentoAssinado } from '../lib/supabaseClient.js';
import type { LoadState } from './useViagens.js';

export interface PortariaKpis {
  aguardandoConferencia: number;
  liberadosNoPatio: number;
  aguardandoSaida: number;
  tempoMedioPatioMinutos: number;
}

/** Lista de entradas de portaria (Módulo 8), opcionalmente filtrada por status. */
export function usePortariaEntradasList(status?: StatusPortariaEntrada) {
  const [state, setState] = useState<LoadState>('idle');
  const [entradas, setEntradas] = useState<Array<PortariaEntrada & { viagem: Viagem | null }>>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const query = status ? `?status=${status}` : '';
      const result = await api.get<Array<PortariaEntrada & { viagem: Viagem | null }>>(
        `/portaria/entradas${query}`,
      );
      setEntradas(result);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, entradas, error, reload: load };
}

export function usePortariaEntradaDetail(id: string | undefined) {
  const [state, setState] = useState<LoadState>('idle');
  const [entrada, setEntrada] = useState<PortariaEntradaDetalhe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setState('loading');
    setError(null);
    try {
      const data = await api.get<PortariaEntradaDetalhe>(`/portaria/entradas/${id}`);
      setEntrada(data);
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

  return { state, entrada, error, reload: load };
}

export function usePortariaKpis() {
  const [state, setState] = useState<LoadState>('idle');
  const [kpis, setKpis] = useState<PortariaKpis | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const data = await api.get<PortariaKpis>('/portaria/kpis');
      setKpis(data);
      setState('success');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, kpis, reload: load };
}

/** Ações de escrita do fluxo de portaria: registrar entrada, anexar documento, mudar status, registrar saída. */
export function usePortariaActions() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    setSubmitting(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.problem.detail ?? err.problem.title)
          : err instanceof Error
            ? err.message
            : 'Erro inesperado',
      );
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const registrarEntrada = useCallback(
    (input: CreatePortariaEntradaInput) =>
      run(() =>
        api.post<{ entrada: PortariaEntrada; ordemServico: OrdemServico | null }>(
          '/portaria/entradas',
          input,
        ),
      ),
    [run],
  );

  const atualizarStatus = useCallback(
    (id: string, status: StatusPortariaEntrada, observacoes?: string) =>
      run(() => api.patch<PortariaEntrada>(`/portaria/entradas/${id}/status`, { status, observacoes })),
    [run],
  );

  const anexarDocumento = useCallback(
    (entradaId: string, input: CreatePortariaDocumentoInput) =>
      run(() =>
        api.post<PortariaDocumento>(`/portaria/entradas/${entradaId}/documentos`, input),
      ),
    [run],
  );

  /**
   * Upload de documento em 3 passos (o browser não tem sessão do Supabase Auth,
   * então o Storage é acessado via token assinado emitido pela API):
   * 1) pede caminho+token à API; 2) envia o binário ao Storage; 3) registra o
   * metadado em `portaria_documentos` via API.
   */
  const anexarArquivo = useCallback(
    (entradaId: string, tipo: TipoDocumentoPortaria, file: File) =>
      run(async () => {
        const upload = await api.post<PortariaDocumentoUploadUrl>(
          `/portaria/entradas/${entradaId}/documentos/upload-url`,
          { nome_arquivo: file.name },
        );
        await uploadPortariaDocumentoAssinado(upload.path, upload.token, file);
        return api.post<PortariaDocumento>(`/portaria/entradas/${entradaId}/documentos`, {
          tipo_documento: tipo,
          storage_path: upload.path,
          nome_arquivo: file.name,
        });
      }),
    [run],
  );

  /** Signed URL temporária (gerada pela API) para abrir/baixar um documento do bucket privado. */
  const obterUrlDocumento = useCallback(
    (entradaId: string, documentoId: string) =>
      run(() =>
        api.get<PortariaDocumentoDownloadUrl>(
          `/portaria/entradas/${entradaId}/documentos/${documentoId}/url`,
        ),
      ),
    [run],
  );

  const registrarSaida = useCallback(
    (entradaId: string, input: CreatePortariaSaidaInput) =>
      run(() =>
        api.post<{ saida: PortariaSaida; entrada: PortariaEntrada }>(
          `/portaria/entradas/${entradaId}/saida`,
          input,
        ),
      ),
    [run],
  );

  return {
    registrarEntrada,
    atualizarStatus,
    anexarDocumento,
    anexarArquivo,
    obterUrlDocumento,
    registrarSaida,
    submitting,
    error,
  };
}
