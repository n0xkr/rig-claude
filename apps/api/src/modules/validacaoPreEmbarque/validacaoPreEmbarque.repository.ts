import type { DocumentoEmbarque } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { fromPgError } from '../../lib/pgConstraintErrors.js';

const TABLE = 'documentos_embarque';

export class ValidacaoPreEmbarqueRepository {
  async listDocumentosByViagem(viagemId: string): Promise<DocumentoEmbarque[]> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('viagem_id', viagemId)
      .is('deleted_at', null);
    if (error) throw fromPgError(error);
    return (data ?? []) as DocumentoEmbarque[];
  }
}
