import { resolverPermissoes, type ModuloKey, type UserRole } from '@rigabras/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { DomainError } from './errors.js';

/**
 * Tabela/coluna inexistente no PostgREST/Postgres: a migration 0013
 * (categorias + permissões) ainda não foi aplicada no banco.
 */
export function isSchemaAusente(error: { code?: string } | null | undefined): boolean {
  return ['PGRST205', 'PGRST204', '42P01', '42703'].includes(error?.code ?? '');
}

export const MIGRATION_0013_PENDENTE =
  'Aplique a migration supabase/migrations/0013_categorias_permissoes.sql no Supabase (SQL Editor) para habilitar categorias e permissões';

/**
 * Permissões de módulo efetivas de um profile (ver `resolverPermissoes`).
 * `row` é a linha de `profiles` já lida (`select('*')`), para não repetir a
 * consulta. Sem a migration 0013 as colunas não existem → `null` (sem
 * restrição), exatamente o comportamento anterior às categorias.
 */
export async function carregarPermissoesEfetivas(row: {
  role: string;
  permissoes?: string[] | null;
  categoria_id?: string | null;
}): Promise<ModuloKey[] | null> {
  const role = row.role as UserRole;
  if (role === 'SUPERADMIN') return null;
  if (Array.isArray(row.permissoes)) return resolverPermissoes(role, row.permissoes, null);
  if (!row.categoria_id) return null;

  const { data, error } = await supabaseAdmin
    .from('categorias_usuario')
    .select('permissoes')
    .eq('id', row.categoria_id)
    .maybeSingle();
  if (error) {
    if (isSchemaAusente(error)) {
      logger.warn(MIGRATION_0013_PENDENTE);
      return null;
    }
    throw new DomainError('Falha ao carregar as permissões', 500, error.message);
  }
  return resolverPermissoes(role, null, (data?.permissoes as string[] | undefined) ?? null);
}
