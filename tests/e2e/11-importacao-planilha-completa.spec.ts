import path from 'node:path';
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers.js';

const PLANILHA = path.resolve(__dirname, '../../RIGABRAS_Controle_GR.xlsx');

test.describe('Importação: varredura de todas as abas', () => {
  test('lê as 25 abas, acha cabeçalho/linhas reais e só oferece importar as abas com destino', async ({
    page,
  }) => {
    await loginAs(page, 'OPERADOR');
    await page.goto('/importar-dados');

    await page.getByTestId('ai-import-file').setInputFiles(PLANILHA);
    const varredura = page.getByTestId('ai-import-varredura');
    await expect(varredura).toContainText('25 abas lidas', { timeout: 30_000 });
    await expect(varredura).toContainText('21 tabelas');

    // FOLLOWUP (viagens) e VEICULOS (veículos) — as demais são cadastros de referência.
    const abas = page.getByTestId('ai-import-aba');
    await expect(abas.filter({ hasText: 'FOLLOWUP' })).toContainText('5 linhas · 94 colunas');
    // Título "VEICULOS N linhas" (o `\b` evita abas como "CHECKLIST_VEICULOS").
    await expect(abas.filter({ hasText: /\bVEICULOS\s*\d+ linhas/ })).toContainText('10 linhas');
    await expect(
      abas.filter({ hasText: 'MOTORISTAS' }).getByTestId('ai-import-target-manual'),
    ).toBeVisible();

    // Busca em todas as abas.
    await page.getByTestId('ai-import-busca').fill('Uruguaiana');
    await expect(page.getByTestId('ai-import-busca-resultado')).toContainText('FOLLOWUP');

    // Importação manual: aba certa pré-selecionada (antes lia só a 1ª aba, LEIA_ME) e colunas mapeadas.
    await page.locator('input[type=file]').nth(1).setInputFiles(PLANILHA);
    await expect(page.getByTestId('manual-aba')).toContainText('25 abas lidas');
    await expect(page.getByTestId('manual-aba').locator('select')).toHaveValue('FOLLOWUP');
    await expect(page.getByRole('heading', { name: /^Mapeamento de colunas/ })).toBeVisible();
    const selects = page.locator('section', { hasText: 'Mapeamento de colunas' }).locator('select');
    await expect(selects.first()).not.toHaveValue('');
  });
});
