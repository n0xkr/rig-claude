import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Credenciais do seed do banco falso em memória (`USE_FAKE_DB=true`, ver
 * `apps/api/src/config/fakeSupabaseSeed.ts`) — as únicas contas que existem
 * neste ambiente de testes.
 */
export const API_BASE_URL = 'http://127.0.0.1:3333/api/v1';

export const SEED_USERS = {
  SUPERADMIN: { email: 'superadmin@rigabras.test', password: 'Teste@123' },
  ADMIN: { email: 'admin@rigabras.test', password: 'Teste@123' },
  OPERADOR: { email: 'operador@rigabras.test', password: 'Teste@123' },
  VISITANTE: { email: 'visitante@rigabras.test', password: 'Teste@123' },
} as const;

export type SeedRole = keyof typeof SEED_USERS;

/** Faz login pela UI de verdade (LoginPage -> POST /auth/login -> localStorage). */
export async function loginAs(page: Page, role: SeedRole): Promise<void> {
  const { email, password } = SEED_USERS[role];
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/viagens$/);
  await expect(page.getByTestId('logout-button')).toBeVisible();
}

/**
 * Obtém um access token diretamente da API (sem navegador) — usado apenas
 * para preparar dados de pré-requisito que não têm nenhuma tela própria
 * neste app (ex: motoristas, endereços de armazém — ver README/relatório
 * final: CRUD dessas entidades existe só na API, nunca foi coberto por uma
 * tela). O CENÁRIO em si (a asserção que o teste realmente verifica) sempre
 * roda pelo navegador de verdade.
 */
export async function apiLogin(request: APIRequestContext, role: SeedRole): Promise<string> {
  const { email, password } = SEED_USERS[role];
  const response = await request.post(`${API_BASE_URL}/auth/login`, {
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { accessToken: string };
  return body.accessToken;
}

export async function apiCreateMotorista(
  request: APIRequestContext,
  token: string,
  overrides: Partial<Record<string, unknown>> = {},
): Promise<string> {
  const suffix = Date.now().toString().slice(-9);
  const response = await request.post(`${API_BASE_URL}/motoristas`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      nome_completo: 'Motorista Playwright',
      cpf: `${suffix}-00`,
      cnh: suffix,
      cnh_categoria: 'E',
      cnh_validade: '2028-05-10',
      ...overrides,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { id: string };
  return body.id;
}

export async function apiCreateEndereco(
  request: APIRequestContext,
  token: string,
  armazemId: string,
): Promise<string> {
  const suffix = Date.now().toString().slice(-6);
  const response = await request.post(`${API_BASE_URL}/wms/enderecos`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { armazem_id: armazemId, area: 'A', rua: suffix, prateleira: '01', posicao: '01' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { id: string };
  return body.id;
}

export async function apiGetArmazemId(request: APIRequestContext, token: string): Promise<string> {
  const response = await request.get(`${API_BASE_URL}/wms/armazens`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { data: Array<{ id: string }> };
  return body.data[0]!.id;
}

/** Gera uma placa de veículo aleatória válida para o formulário de viagem (6-8 chars). */
export function randomPlaca(): string {
  const n = Math.floor(Math.random() * 9999)
    .toString()
    .padStart(4, '0');
  return `PW${n}A1`;
}
