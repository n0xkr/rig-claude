import { createClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase do browser, usado exclusivamente para upload direto de
 * documentos da portaria no Supabase Storage (bucket privado
 * 'portaria-documentos', ver migration 0008). Usa a ANON KEY — a
 * autorização real de leitura/escrita do bucket é feita pelas policies de
 * RLS de `storage.objects` (papel do usuário autenticado via Supabase Auth),
 * nunca por este client ser "de confiança". Login/CRUD de dados de negócio
 * continuam passando pela API própria (Fastify + JWT), este client não é
 * usado para autenticação.
 */
export const supabaseStorage = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const BUCKET = 'portaria-documentos';

/** Envia um arquivo (foto/PDF) para o bucket da portaria e retorna o caminho armazenado. */
export async function uploadPortariaDocumento(
  entradaId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${entradaId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseStorage.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw error;
  return path;
}
