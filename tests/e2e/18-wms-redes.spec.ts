import { test, expect } from '@playwright/test';
import { loginAs, novaPlaca } from './helpers.js';

/**
 * Módulo 5 — Redes dos veículos (WMS): cadastro com código RED-###### gerado
 * no servidor, KPIs do relatório em tempo real e movimentação (retirada com
 * veículo/cliente + devolução ao pátio) com mudança de status. A exclusão de
 * uma rede em trânsito é recusada pela UI (botão bloqueado) e pelo backend.
 */
test('cadastra rede, retira para um veículo e devolve ao pátio', async ({ page }) => {
  await loginAs(page, 'OPERADOR');
  const placa = await novaPlaca(page);

  await page.goto('/wms/redes');
  await expect(page.getByRole('heading', { name: 'Redes dos veículos', level: 1 })).toBeVisible();
  await expect(page.getByTestId('kpis-redes')).toBeVisible();

  await page.getByTestId('nova-rede').click();
  await expect(page.getByTestId('rede-form')).toBeVisible();
  await page.getByTestId('rede-condicao').selectOption('BOA');
  await page.getByTestId('rede-validade').fill('2027-12-31');
  await page.getByTestId('rede-padrao-cliente').check();
  await page.getByTestId('salvar-rede').click();
  await expect(page.getByTestId('rede-form')).toHaveCount(0);

  // A lista é ordenada por id desc (uuid v7): a rede recém-criada é a primeira.
  const linha = page.locator('[data-testid^="rede-linha-"]').first();
  await expect(linha).toContainText('BOA');
  await expect(linha).toContainText('Disponível');
  await expect(linha).toContainText('Padrão cliente');
  await expect(linha).toContainText('validade 31/12/2027');

  const testid = (await linha.getAttribute('data-testid'))!;
  const codigo = testid.replace('rede-linha-', '');

  // Retirada: exige cliente + veículo; a rede sai do pátio.
  await page.getByTestId(`movimentar-rede-${codigo}`).click();
  await page.getByTestId(`mov-cliente-${codigo}`).fill('Cliente PW Redes');
  const veiculoSelect = page.getByTestId(`mov-veiculo-${codigo}`);
  const opcao = veiculoSelect.locator('option', { hasText: placa });
  await expect(opcao).toHaveCount(1);
  await veiculoSelect.selectOption({ label: (await opcao.textContent())!.trim() });
  await page.getByTestId(`confirmar-mov-${codigo}`).click();

  await expect(linha).toContainText('Em trânsito');
  await expect(linha).toContainText(placa);
  // Rede em trânsito não pode ser excluída.
  await expect(page.getByTestId(`excluir-rede-${codigo}`)).toBeDisabled();

  // Devolução: a rede volta e volta a ficar disponível no pátio.
  await page.getByTestId(`movimentar-rede-${codigo}`).click();
  await page.getByTestId(`mov-cliente-${codigo}`).fill('Cliente PW Redes');
  await page.getByTestId(`confirmar-mov-${codigo}`).click();

  await expect(linha).toContainText('Disponível');
  await expect(linha).not.toContainText(placa);

  // Relatório em tempo real: contagens atualizadas no painel.
  await expect(page.getByTestId('kpi-total')).not.toHaveText('—');
  await expect(page.getByTestId('kpi-disponiveis')).not.toHaveText('—');
});

test('filtra redes por busca e condição', async ({ page }) => {
  await loginAs(page, 'OPERADOR');

  await page.goto('/wms/redes');
  await expect(page.getByRole('heading', { name: 'Redes dos veículos', level: 1 })).toBeVisible();

  await page.getByTestId('buscar-redes').fill('RED-000000');
  await expect(page.locator('[data-testid^="rede-linha-"]')).toHaveCount(0);

  await page.getByTestId('buscar-redes').fill('');
  await page.getByTestId('filtro-condicao-rede').selectOption('RUIM');
  for (const linha of await page.locator('[data-testid^="rede-linha-"]').all()) {
    await expect(linha).toContainText('RUIM');
  }
});
