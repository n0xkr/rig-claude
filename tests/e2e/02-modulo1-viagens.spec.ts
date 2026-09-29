import { test, expect } from '@playwright/test';
import { loginAs, novaPlaca } from './helpers.js';

test.describe('Módulo 1 — Gerenciamento de Risco (viagens)', () => {
  test('cria uma viagem, vê na lista e abre o detalhe', async ({ page }) => {
    await loginAs(page, 'OPERADOR');
    const placa = await novaPlaca(page);

    await page.getByRole('link', { name: 'Nova viagem' }).click();
    await expect(page).toHaveURL(/\/viagens\/nova$/);
    await page.getByLabel('Placa do cavalo *').selectOption(placa);
    await page.getByLabel('Origem *').fill('Uruguaiana/RS');
    await page.getByLabel('Destino *', { exact: true }).fill('Assunção/PY');
    await page.getByRole('button', { name: 'Criar viagem' }).click();

    await expect(page).toHaveURL(/\/viagens$/);
    await expect(page.getByText(placa)).toBeVisible();

    await page.getByText(placa).click();
    await expect(page.getByText('Uruguaiana/RS → Assunção/PY')).toBeVisible();
    await expect(page.getByText(placa, { exact: false })).toBeVisible();
  });

  test('estado vazio: filtro por um status sem viagens mostra empty state', async ({ page }) => {
    await loginAs(page, 'OPERADOR');
    // ENCERRADA é um estado terminal raro de se atingir sem um fluxo
    // completo — bom candidato para exercitar o empty state real da lista.
    await page.getByRole('button', { name: 'ENCERRADA' }).click();
    await expect(page.getByText('Nenhuma viagem cadastrada')).toBeVisible();
  });
});
