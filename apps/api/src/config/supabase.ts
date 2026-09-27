import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * Cliente Supabase com service-role key, usado exclusivamente no backend.
 * Este client ignora RLS (bypass), portanto TODO o controle de acesso deve
 * ser reforçado pelo middleware RBAC da API (belt-and-suspenders com as
 * policies RLS que também protegem acessos diretos ao banco).
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
