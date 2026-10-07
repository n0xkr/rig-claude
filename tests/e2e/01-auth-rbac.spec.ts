import { test, expect } from '@playwright/test';
import { loginAs, API_BASE_URL, SEED_USERS } from './helpers.js';

test.describe('Autenticação e RBAC', () => {
  test('login como ADMIN chega em /viagens autenticado', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await expect(page.getByRole('heading', { name: 'Viagens' })).toBeVisible();
    await expect(page.getByTestId('logout-button')).toContainText('ADMIN');
  });

  test('login como OPERADOR chega em /viagens autenticado', async ({ page }) => {
    await loginAs(page, 'OPERADOR');
    await expect(page.getByRole('heading', { name: 'Viagens' })).toBeVisible();
    await expect(page.getByTestId('logout-button')).toContainText('OPERADOR');
  });

  test('login com senha errada mostra erro e não navega', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(SEED_USERS.ADMIN.email);
    await page.getByTestId('login-password').fill('senha-errada-123');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('rota protegida redireciona para /login sem sessão', async ({ page }) => {
    await page.goto('/viagens');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('logout limpa a sessão e volta a exigir login', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await page.getByTestId('logout-button').click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/viagens');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('RBAC: OPERADOR não vê a tela de Exportações (restrita a ADMIN/SUPERADMIN)', async ({
    page,
  }) => {
    await loginAs(page, 'OPERADOR');
    await page.goto('/exportacoes');
    await expect(page.getByText('Acesso restrito')).toBeVisible();
    await expect(
      page.getByText('restrita aos papéis ADMIN e SUPERADMIN', { exact: false }),
    ).toBeVisible();
  });

  test('RBAC: ADMIN vê a tela de Exportações normalmente', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await page.goto('/exportacoes');
    await expect(page.getByRole('heading', { name: 'Exportações (Integração ERP)' })).toBeVisible();
    await expect(page.getByText('Acesso restrito')).not.toBeVisible();
  });

  test('RBAC no backend: OPERADOR recebe 403 da API de exportação ERP, ADMIN recebe 200', async ({
    request,
  }) => {
    const loginOperador = await request.post(`${API_BASE_URL}/auth/login`, {
      data: SEED_USERS.OPERADOR,
    });
    const { accessToken: operadorToken } = (await loginOperador.json()) as {
      accessToken: string;
    };
    const asOperador = await request.get(
      `${API_BASE_URL}/erp-export/financeiro?inicio=2020-01-01&fim=2030-12-31&formato=json`,
      { headers: { Authorization: `Bearer ${operadorToken}` } },
    );
    expect(asOperador.status()).toBe(403);

    const loginAdmin = await request.post(`${API_BASE_URL}/auth/login`, {
      data: SEED_USERS.ADMIN,
    });
    const { accessToken: adminToken } = (await loginAdmin.json()) as { accessToken: string };
    const asAdmin = await request.get(
      `${API_BASE_URL}/erp-export/financeiro?inicio=2020-01-01&fim=2030-12-31&formato=json`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(asAdmin.status()).toBe(200);
  });
});
