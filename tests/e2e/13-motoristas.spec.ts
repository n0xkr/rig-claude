import { test, expect } from '@playwright/test';
import { loginAs } from './helpers.js';

test.describe('Motoristas', () => {
  test('cadastra motorista manualmente (sem OCR) e vê na lista com a validade da CNH', async ({ page }) => {
    await loginAs(page, 'OPERADOR');
    await page.getByRole('link', { name: 'Motoristas' }).click();
    await expect(page.getByTestId('motoristas-page')).toBeVisible();
    await page.getByTestId('motorista-novo').click();

    const nome = `Motorista Manual ${Date.now().toString().slice(-5)}`;
    await page.getByTestId('mf-nome_completo').fill(nome);
    await page.getByTestId('mf-cpf').fill('52998224725');
    await expect(page.getByTestId('mf-cpf')).toHaveValue('529.982.247-25');
    await page.getByTestId('mf-data_nascimento').fill('1980-05-10');
    await page.getByTestId('mf-nome_mae').fill('Maria da Silva');
    await page.getByTestId('mf-cnh').fill('12345678901');
    await page.getByTestId('mf-cnh_categoria').fill('E');
    await page.getByTestId('mf-cnh_validade').fill('2020-01-01');
    await page.getByTestId('mf-salvar').click();

    await expect(page).toHaveURL(/\/motoristas\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('mf-nome_mae')).toHaveValue('Maria da Silva');

    await page.goto('/motoristas');
    const item = page.getByTestId('motoristas-lista').getByRole('listitem').filter({ hasText: nome });
    await expect(item).toContainText('CNH vencida');
  });
});
