import { test, expect } from '@playwright/test';
import { loginAs, preencherNovaViagem } from './helpers.js';

test.describe('Viagens', () => {
  test('cria uma viagem com 2 documentos (CRT + DANFE), carreta e checagens, e abre o detalhe', async ({
    page,
  }) => {
    await loginAs(page, 'OPERADOR');
    const placa = await preencherNovaViagem(page, 'Assunção/PY');
    await page.getByTestId('carga-numero').first().fill('BR.9999.00001');
    await page.getByTestId('carga-adicionar').click();
    const segunda = page.getByTestId('viagem-carga').nth(1);
    await segunda.locator('select').selectOption('DANFE');
    await segunda.getByTestId('carga-numero').fill('123456');
    await page.getByTestId('viagem-placa-carreta').fill('ABC1D23');
    await page.getByTestId('viagem-checklist_ok').check();
    await page.getByRole('button', { name: 'Criar viagem' }).click();

    await expect(page).toHaveURL(/\/viagens$/);
    await page.getByText(placa).first().click();
    await expect(page.getByText('Uruguaiana/RS → Assunção/PY')).toBeVisible();
    await expect(page.getByTestId('viagem-cargas')).toContainText('BR.9999.00001');
    await expect(page.getByTestId('viagem-cargas')).toContainText('123456');
    await expect(page.getByTestId('check-checklist_ok')).toHaveClass(/emerald/);
  });

  test('viagem com início no futuro fica agendada', async ({ page }) => {
    await loginAs(page, 'OPERADOR');
    const placa = await preencherNovaViagem(page, 'Rosario/AR');
    const d = new Date(Date.now() + 3 * 86400000);
    const pad = (n: number) => String(n).padStart(2, '0');
    await page
      .getByTestId('viagem-data-inicio')
      .fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T08:00`);
    await expect(page.getByTestId('viagem-agendada-aviso')).toBeVisible();
    await page.getByRole('button', { name: 'Agendar viagem' }).click();
    await expect(page).toHaveURL(/\/viagens$/);
    await page.getByRole('button', { name: 'Agendadas' }).click();
    await expect(page.getByTestId('viagens-lista')).toContainText(placa);
  });

  test('estado vazio: filtro sem viagens mostra empty state', async ({ page }) => {
    await loginAs(page, 'OPERADOR');
    await page.getByRole('button', { name: 'Canceladas' }).click();
    await expect(page.getByText('Nenhuma viagem aqui')).toBeVisible();
  });
});
