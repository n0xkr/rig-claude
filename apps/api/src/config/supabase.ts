import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { createFakeSupabaseClient, createFakeStore } from './fakeSupabase.js';
import { seedFakeStore } from './fakeSupabaseSeed.js';

/**
 * Cliente Supabase com service-role key, usado exclusivamente no backend.
 * Este client ignora RLS (bypass), portanto TODO o controle de acesso deve
 * ser reforçado pelo middleware RBAC da API (belt-and-suspenders com as
 * policies RLS que também protegem acessos diretos ao banco).
 *
 * Quando `USE_FAKE_DB=true` (só para dev local/testes sem Docker disponível
 * — ver `fakeSupabase.ts`), este export vira um cliente falso em memória com
 * a mesma API encadeável, para que nenhum repository/service precise saber a
 * diferença. NUNCA usar em produção.
 */
export const supabaseAdmin: SupabaseClient = env.USE_FAKE_DB
  ? (() => {
      const store = createFakeStore();
      seedFakeStore(store);
      // O fake implementa apenas o subconjunto de `SupabaseClient` de fato
      // usado pelos repositories (ver fakeSupabase.ts) — cast documentado,
      // nunca usado em produção (USE_FAKE_DB é sempre `false` lá).
      return createFakeSupabaseClient(store) as unknown as SupabaseClient;
    })()
  : createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

/**
 * Client descartável só para validar senha (`signInWithPassword`). NUNCA chamar
 * `signInWithPassword` em `supabaseAdmin`: o supabase-js guarda a sessão do
 * usuário no client e passa a enviar o JWT dele no lugar da service-role, e todas
 * as queries seguintes da API rodariam como esse usuário, sob RLS (ex.: a lista de
 * usuários voltava só com o perfil de quem acabou de logar). Um client novo por
 * chamada, com a anon key, isola a sessão.
 */
export function createPasswordAuthClient(): SupabaseClient {
  if (env.USE_FAKE_DB) return supabaseAdmin;
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
