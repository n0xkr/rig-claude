import path from 'node:path';
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers.js';

const PLANILHA = path.resolve(__dirname, '../../RIGABRAS_Controle_GR.xlsx');

test.describe('Importação inteligente: planilha completa, sem mapear colunas', () => {
  test('entende as abas, cruza viagens/motoristas/veículos/CRT/checklist/SMP e grava', async ({
    page,
  }) => {
    await loginAs(page, 'OPERADOR');
    await page.goto('/importar-dados');
    await page.getByTestId('importacao-inteligente-arquivo').setInputFiles(PLANILHA);

    await expect(page.getByTestId('importacao-totais')).toBeVisible({ timeout: 60_000 });

    await page.getByRole('button', { name: /Como cada aba foi entendida/ }).click();
    const abas = page.getByTestId('importacao-abas');
    await expect(abas).toContainText('FOLLOWUP → Viagens');
    await expect(abas).toContainText('MOTORISTAS → Motoristas');
    await expect(abas).toContainText('VEICULOS → Veículos');
    await expect(abas).toContainText('CHECKLISTS → Checklists');

    const viagens = page.getByTestId('importacao-viagens');
    await expect(viagens).toContainText('RGB-2026-0412');
    await expect(viagens).toContainText('IYA3B21 + IRS1B10');
    await expect(viagens).toContainText('Na fronteira aguardando descarga');

    await page.getByTestId('importacao-gravar').click();
    await expect(page.getByTestId('importacao-concluida')).toBeVisible({ timeout: 60_000 });

    await page.goto('/viagens');
    await page.getByTestId('viagens-busca').fill('RGB-2026-0412');
    await page.getByTestId('viagens-lista').getByRole('link').first().click();
    await expect(page.getByTestId('viagem-cargas')).toContainText('BR.1234.00456');
    await expect(page.getByTestId('check-checklist_ok')).toHaveClass(/emerald/);
  });
});
