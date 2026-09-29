import { test, expect } from '@playwright/test';
import { loginAs, randomPlaca } from './helpers.js';

test.describe('Acompanhamento de veículos', () => {
  test('cadastra, edita e vê o veículo na tabela e nos gráficos', async ({ page }) => {
    await loginAs(page, 'OPERADOR');
    await page.getByRole('link', { name: 'Acompanhamento' }).click();
    await expect(page.getByTestId('acompanhamento-page')).toBeVisible();

    const placa = randomPlaca();
    await page.getByTestId('btn-novo-veiculo').click();
    await page.getByTestId('vf-placa').fill(placa);
    await page.getByTestId('vf-km').fill('120000');
    await page.getByTestId('vf-status').selectOption('EM_TRANSITO');
    await page.getByTestId('vf-salvar').click();

    const linha = page.getByTestId('acomp-linha').filter({ hasText: placa });
    await expect(linha).toBeVisible();
    await expect(linha).toContainText('Em trânsito');
    await expect(linha).toContainText('120.000');

    await linha.getByTestId('acomp-editar').click();
    await page.getByTestId('vf-km').fill('130500');
    await page.getByTestId('vf-status').selectOption('MANUTENCAO');
    await page.getByTestId('vf-salvar').click();
    await expect(linha).toContainText('Manutenção');
    await expect(linha).toContainText('130.500');
  });

  test('importa planilha CSV: IA/heurística mapeia colunas, valida e grava; reimportar atualiza', async ({ page }) => {
    await loginAs(page, 'OPERADOR');
    await page.goto('/acompanhamento');
    const p1 = randomPlaca();
    const p2 = randomPlaca();
    const csv = (km: string) =>
      [
        'Placa,Modelo,Situação,Quilometragem,Combustível %,Próxima Manutenção',
        `${p1},Volvo FH 460,Em Trânsito,"${km}",55%,10/11/2030`,
        `${p2},Scania R 500,Em Manutenção,"310.000",18%,20/09/2020`,
      ].join('\n');

    await page.getByTestId('btn-importar-ia').click();
    await page.getByTestId('ai-import-file').setInputFiles({
      name: 'frota.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv('120.300')),
    });
    await expect(page.getByTestId('ai-import-target')).toHaveValue('veiculos', { timeout: 30_000 });
    await page.getByTestId('ai-import-validar').click();
    await expect(page.getByText('2 válidas · 0 com erro')).toBeVisible();
    await page.getByTestId('ai-import-importar').click();
    await expect(page.getByTestId('ai-import-resultado')).toContainText('2 de 2 linhas importadas');
    await page.getByRole('button', { name: 'Fechar' }).click();

    const linha1 = page.getByTestId('acomp-linha').filter({ hasText: p1 });
    await expect(linha1).toContainText('Em trânsito');
    await expect(linha1).toContainText('120.300');
    await expect(linha1).toContainText('55%');
    await expect(page.getByTestId('acomp-linha').filter({ hasText: p2 })).toContainText('(vencida)');

    // Reimportar a mesma placa ATUALIZA (não duplica).
    await page.getByTestId('btn-importar-ia').click();
    await page.getByTestId('ai-import-file').setInputFiles({
      name: 'frota2.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv('150.000')),
    });
    await expect(page.getByTestId('ai-import-target')).toHaveValue('veiculos', { timeout: 30_000 });
    await page.getByTestId('ai-import-importar').click();
    await expect(page.getByTestId('ai-import-resultado')).toContainText('2 de 2');
    await page.getByRole('button', { name: 'Fechar' }).click();
    await expect(page.getByTestId('acomp-linha').filter({ hasText: p1 })).toHaveCount(1);
    await expect(page.getByTestId('acomp-linha').filter({ hasText: p1 })).toContainText('150.000');
  });

  test('gera insights e ADMIN exclui um veículo', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await page.goto('/acompanhamento');
    const placa = randomPlaca();
    await page.getByTestId('btn-novo-veiculo').click();
    await page.getByTestId('vf-placa').fill(placa);
    await page.getByTestId('vf-salvar').click();
    const linha = page.getByTestId('acomp-linha').filter({ hasText: placa });
    await expect(linha).toBeVisible();

    await page.getByTestId('insights-btn-geral').click();
    await expect(page.getByTestId('insights-geral')).toContainText(/Gerado por/);

    page.once('dialog', (d) => void d.accept());
    await linha.getByTestId('acomp-excluir').click();
    await expect(linha).toHaveCount(0);
  });

  test('OPERADOR não vê o botão de excluir', async ({ page }) => {
    await loginAs(page, 'OPERADOR');
    await page.goto('/acompanhamento');
    await expect(page.getByTestId('acompanhamento-page')).toBeVisible();
    await expect(page.getByTestId('acomp-excluir')).toHaveCount(0);
  });
});
