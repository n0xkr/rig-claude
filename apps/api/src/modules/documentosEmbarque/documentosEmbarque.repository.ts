import type {
  CreateDocumentoEmbarqueInput,
  DocumentoEmbarque,
  UpdateDocumentoEmbarqueInput,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';

const TABLE = 'documentos_embarque';

export class DocumentosEmbarqueRepository {
  async listByViagem(viagemId: string): Promise<DocumentoEmbarque[]> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('viagem_id', viagemId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as DocumentoEmbarque[];
  }

  async findById(id: string): Promise<DocumentoEmbarque | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as DocumentoEmbarque | null) ?? null;
  }

  async create(input: CreateDocumentoEmbarqueInput): Promise<DocumentoEmbarque> {
    const { data, error } = await supabaseAdmin.from(TABLE).insert(input).select('*').single();
    if (error) throw error;
    return data as DocumentoEmbarque;
  }

  async update(id: string, input: UpdateDocumentoEmbarqueInput): Promise<DocumentoEmbarque> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(input)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error) throw error;
    return data as DocumentoEmbarque;
  }

  async validar(id: string, validadoPor: string | null): Promise<DocumentoEmbarque> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update({ validado: true, validado_por: validadoPor, validado_em: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error) throw error;
    return data as DocumentoEmbarque;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }
}
