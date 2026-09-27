import type { FakeSupabaseStore } from './fakeSupabase.js';

/**
 * Seed mínimo do banco falso em memória (`USE_FAKE_DB=true`): um perfil por
 * papel de RBAC (para o login do Playwright/testes manuais) e um armazém
 * (referenciado pelo módulo WMS). Tudo o mais (viagens, veículos,
 * depositantes, fretes...) é criado pelos próprios testes através da API
 * real, exatamente como um usuário faria.
 *
 * Credenciais de teste (só existem neste modo fake, nunca em produção):
 *   superadmin@rigabras.test / Teste@123 (SUPERADMIN)
 *   admin@rigabras.test      / Teste@123 (ADMIN)
 *   operador@rigabras.test   / Teste@123 (OPERADOR)
 *   visitante@rigabras.test  / Teste@123 (VISITANTE)
 */
const SEED_PASSWORD = 'Teste@123';

interface SeedProfile {
  id: string;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'OPERADOR' | 'VISITANTE';
  nome_completo: string;
}

export const SEED_PROFILES: SeedProfile[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'superadmin@rigabras.test',
    role: 'SUPERADMIN',
    nome_completo: 'Super Admin (seed)',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'admin@rigabras.test',
    role: 'ADMIN',
    nome_completo: 'Admin (seed)',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'operador@rigabras.test',
    role: 'OPERADOR',
    nome_completo: 'Operador (seed)',
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'visitante@rigabras.test',
    role: 'VISITANTE',
    nome_completo: 'Visitante (seed)',
  },
];

export const SEED_ARMAZEM_ID = '00000000-0000-0000-0000-0000000000a1';

export function seedFakeStore(store: FakeSupabaseStore): void {
  const profiles = SEED_PROFILES.map((p) => ({
    id: p.id,
    nome_completo: p.nome_completo,
    email: p.email,
    role: p.role,
    ativo: true,
    created_at: new Date().toISOString(),
  }));
  store.tables.set('profiles', profiles);

  for (const p of SEED_PROFILES) {
    store.authUsers.set(p.email, { id: p.id, email: p.email, password: SEED_PASSWORD });
  }

  store.tables.set('armazens', [
    {
      id: SEED_ARMAZEM_ID,
      nome: 'Armazém Geral Rigabras - Uruguaiana',
      endereco: 'Av. Rondon Pacheco, 1000 - Uruguaiana/RS',
      area_total_m3: 5500,
      created_at: new Date().toISOString(),
    },
  ]);
}
