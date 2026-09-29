import type {
  CreateOrdemServicoInput,
  CreatePortariaDocumentoInput,
  CreatePortariaEntradaInput,
  CreatePortariaSaidaInput,
  OrdemServico,
  PortariaDocumento,
  PortariaEntrada,
  PortariaSaida,
  StatusPortariaEntrada,
  Viagem,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';

const ENTRADAS = 'portaria_entradas';
const DOCUMENTOS = 'portaria_documentos';
const SAIDAS = 'portaria_saidas';
const ORDENS_SERVICO = 'ordens_servico';
const BUCKET_DOCUMENTOS = 'portaria-documentos';

export interface ListEntradasFilter {
  status?: StatusPortariaEntrada;
}

export class PortariaRepository {
  async listEntradas(
    filter: ListEntradasFilter,
  ): Promise<Array<PortariaEntrada & { viagem: Viagem | null }>> {
    let query = supabaseAdmin
      .from(ENTRADAS)
      .select('*, viagem:viagens(*)')
      .is('deleted_at', null)
      .order('data_entrada', { ascending: false });
    if (filter.status) query = query.eq('status', filter.status);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as Array<PortariaEntrada & { viagem: Viagem | null }>;
  }

  async findEntradaById(id: string): Promise<PortariaEntrada | null> {
    const { data, error } = await supabaseAdmin
      .from(ENTRADAS)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as PortariaEntrada | null) ?? null;
  }

  async createEntrada(
    input: CreatePortariaEntradaInput,
    registradoPor: string | null,
  ): Promise<PortariaEntrada> {
    const { data, error } = await supabaseAdmin
      .from(ENTRADAS)
      .insert({ ...input, registrado_por: registradoPor })
      .select('*')
      .single();
    if (error) throw error;
    return data as PortariaEntrada;
  }

  async updateEntradaStatus(
    id: string,
    status: StatusPortariaEntrada,
    observacoes: string | null | undefined,
  ): Promise<PortariaEntrada> {
    const patch: Record<string, unknown> = { status };
    if (observacoes !== undefined) patch.observacoes = observacoes;
    const { data, error } = await supabaseAdmin
      .from(ENTRADAS)
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as PortariaEntrada;
  }

  async listDocumentos(entradaId: string): Promise<PortariaDocumento[]> {
    const { data, error } = await supabaseAdmin
      .from(DOCUMENTOS)
      .select('*')
      .eq('entrada_id', entradaId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as PortariaDocumento[];
  }

  async createDocumento(
    entradaId: string,
    input: CreatePortariaDocumentoInput,
    enviadoPor: string | null,
  ): Promise<PortariaDocumento> {
    const { data, error } = await supabaseAdmin
      .from(DOCUMENTOS)
      .insert({ ...input, entrada_id: entradaId, enviado_por: enviadoPor })
      .select('*')
      .single();
    if (error) throw error;
    return data as PortariaDocumento;
  }

  async findDocumentoById(entradaId: string, documentoId: string): Promise<PortariaDocumento | null> {
    const { data, error } = await supabaseAdmin
      .from(DOCUMENTOS)
      .select('*')
      .eq('id', documentoId)
      .eq('entrada_id', entradaId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as PortariaDocumento | null) ?? null;
  }

  /**
   * Gera (service role) um token de upload assinado para o bucket privado.
   * O browser não tem sessão do Supabase Auth, então não pode enviar direto.
   */
  async criarUrlUploadDocumento(path: string): Promise<{ path: string; token: string }> {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_DOCUMENTOS)
      .createSignedUploadUrl(path);
    if (error) throw error;
    return { path: data.path, token: data.token };
  }

  /** Signed URL de leitura; devolve null se o objeto não existir no bucket. */
  async criarUrlDownloadDocumento(path: string, expiresIn: number): Promise<string | null> {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_DOCUMENTOS)
      .createSignedUrl(path, expiresIn);
    if (error || !data) return null;
    return data.signedUrl;
  }

  async findSaidaByEntrada(entradaId: string): Promise<PortariaSaida | null> {
    const { data, error } = await supabaseAdmin
      .from(SAIDAS)
      .select('*')
      .eq('entrada_id', entradaId)
      .maybeSingle();
    if (error) throw error;
    return (data as PortariaSaida | null) ?? null;
  }

  async createSaida(
    entradaId: string,
    input: CreatePortariaSaidaInput,
    tempoPatioMinutos: number,
    registradoPor: string | null,
  ): Promise<PortariaSaida> {
    const { data, error } = await supabaseAdmin
      .from(SAIDAS)
      .insert({
        ...input,
        entrada_id: entradaId,
        tempo_patio_minutos: tempoPatioMinutos,
        registrado_por: registradoPor,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as PortariaSaida;
  }

  /** Tempos de permanência de todas as saídas registradas (uma única query, para o KPI de média). */
  async listTemposPatioMinutos(): Promise<number[]> {
    const { data, error } = await supabaseAdmin.from(SAIDAS).select('tempo_patio_minutos');
    if (error) throw error;
    return ((data ?? []) as Array<{ tempo_patio_minutos: number }>).map(
      (row) => row.tempo_patio_minutos,
    );
  }

  async createOrdemServico(
    input: CreateOrdemServicoInput,
    createdBy: string | null,
  ): Promise<OrdemServico> {
    const { data, error } = await supabaseAdmin
      .from(ORDENS_SERVICO)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw error;
    return data as OrdemServico;
  }

  async listOrdensServicoByEntrada(entradaId: string): Promise<OrdemServico[]> {
    const { data, error } = await supabaseAdmin
      .from(ORDENS_SERVICO)
      .select('*')
      .eq('entrada_portaria_id', entradaId)
      .is('deleted_at', null);
    if (error) throw error;
    return (data ?? []) as OrdemServico[];
  }

  async updateOrdemServicoStatus(
    id: string,
    status: OrdemServico['status'],
    observacoes: string | null | undefined,
  ): Promise<OrdemServico> {
    const patch: Record<string, unknown> = { status };
    if (observacoes !== undefined) patch.observacoes = observacoes;
    if (status === 'FINALIZADA') patch.finalizada_em = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from(ORDENS_SERVICO)
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as OrdemServico;
  }

  async findViagemById(id: string): Promise<Viagem | null> {
    const { data, error } = await supabaseAdmin
      .from('viagens')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as Viagem | null) ?? null;
  }

  /** Nota na timeline da viagem — mesmo padrão de integração usado pelo Módulo 6 (WMS -> TMS). */
  async registrarNotaTimelineViagem(
    viagemId: string,
    status: Viagem['status'],
    observacoes: string,
    changedBy: string | null,
  ): Promise<void> {
    const { error } = await supabaseAdmin.from('status_viagem_historico').insert({
      viagem_id: viagemId,
      status_anterior: status,
      status_novo: status,
      changed_by: changedBy,
      observacoes,
      origem_evento: 'PORTARIA',
    });
    if (error) throw error;
  }
}
