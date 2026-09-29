import { DomainError } from './errors.js';
import { isSchemaAusente } from './permissoes.js';

export const MIGRATION_0014 = 'supabase/migrations/0014_viagens_fluxo_cargas.sql';

/**
 * O banco ainda não tem a migration 0014 (colunas/tabelas novas de viagens ou
 * os novos valores do enum `status_viagem`)? Erro do PostgREST/Postgres:
 * coluna/tabela inexistente, ou valor de enum desconhecido.
 */
export function faltaMigration0014(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  if (isSchemaAusente(error)) return true;
  return error.code === '22P02' && /status_viagem/.test(error.message ?? '');
}

export function erroMigration0014(): DomainError {
  return new DomainError(
    'Banco de dados desatualizado',
    503,
    `Esta função precisa da migration ${MIGRATION_0014}. Um administrador deve colá-la inteira no SQL Editor do Supabase e executar (é segura para rodar mais de uma vez).`,
  );
}
