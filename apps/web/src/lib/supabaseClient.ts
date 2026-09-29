import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase do browser, usado EXCLUSIVAMENTE para enviar o binário de
 * documentos da portaria ao bucket privado 'portaria-documentos' usando um
 * token de upload assinado gerado pela API (POST
 * /portaria/entradas/:id/documentos/upload-url).
 *
 * Por que não fazer upload direto com a ANON KEY: o login do sistema é feito
 * pela API própria (que chama `signInWithPassword` no servidor), então o
 * browser NUNCA tem sessão do Supabase Auth — as policies de `storage.objects`
 * (baseadas em `current_user_role()`/auth.uid()) rejeitariam o upload como
 * papel `anon`. Com o token assinado, a autorização é da API (RBAC) e o
 * Storage aceita o PUT sem depender de sessão. Login/CRUD de negócio
 * continuam passando pela API (Fastify + JWT).
 */
let client: SupabaseClient | null = null;

/**
 * Criado sob demanda: instanciar no carregamento do módulo lançava exceção
 * (URL inválida) quando as VITE_SUPABASE_* não eram definidas no build,
 * derrubando o app inteiro (tela em branco).
 */
function getSupabaseStorage(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error('Upload indisponível: VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY não configuradas');
    }
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

const BUCKET = 'portaria-documentos';

/** Envia o arquivo (foto/PDF) ao caminho/token assinados emitidos pela API. */
export async function uploadPortariaDocumentoAssinado(
  path: string,
  token: string,
  file: File,
): Promise<void> {
  const { error } = await getSupabaseStorage()
    .storage.from(BUCKET)
    .uploadToSignedUrl(path, token, file, {
      contentType: file.type || 'application/octet-stream',
    });
  if (error) throw error;
}
