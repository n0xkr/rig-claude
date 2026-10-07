import { test, expect } from '@playwright/test';
import { loginAs, novaPlaca } from './helpers.js';

/**
 * Módulo 5 — WMS > Checklist > Redes: cadastro de rede de contenção com o
 * checklist (rede OK sem danos, número do lacre e as 6 catracas OK), código
 * RED-###### gerado no servidor, progresso do checklist do painel, edição do
 * cadastro/checklist, KPIs do relatório em tempo real e movimentação
 * (retirada com veículo/cliente + devolução ao pátio) com mudança de status.
 * A exclusão de uma rede em trânsito é recusada pela UI (botão bloqueado) e
 * pelo backend.
 */
test('cadastra rede com checklist, edita o lacre, retira para um veículo e devolve ao pátio', async ({ page }) => {
  await loginAs(page, 'OPERADOR');
  const placa = await novaPlaca(page);

  await page.goto('/wms/checklist/redes');
  await expect(page.getByRole('heading', { name: 'Redes de contenção', level: 1 })).toBeVisible();
  await expect(page.getByTestId('kpis-redes')).toBeVisible();
  await expect(page.getByTestId('progresso-checklist')).toBeVisible();
  await expect(page.getByTestId('progresso-checklist-texto')).toContainText(
    /\d+\/\d+ redes conferidas \(\d+%\)/,
  );

  await page.getByTestId('nova-rede').click();
  await expect(page.getByTestId('rede-form')).toBeVisible();
  await expect(page.getByTestId('checklist-titulo')).toContainText('cintas');
  await page.getByTestId('checklist-rede-ok').selectOption('true');
  await page.getByTestId('checklist-lacre').fill('004512');
  await page.getByTestId('checklist-catracas-ok').selectOption('true');
  await page.getByTestId('rede-condicao').selectOption('BOA');
  await page.getByTestId('rede-validade').fill('2027-12-31');
  await page.getByTestId('rede-padrao-cliente').check();
  await page.getByTestId('salvar-rede').click();
  await expect(page.getByTestId('rede-form')).toHaveCount(0);

  // A lista é ordenada por id desc (uuid v7): a rede recém-criada é a primeira.
  const linha = page.locator('[data-testid^="rede-linha-"]').first();
  await expect(linha).toContainText('BOA');
  await expect(linha).toContainText('Disponível');
  await expect(linha).toContainText('Checklist OK');
  await expect(linha).toContainText('lacre 004512');
  await expect(linha).toContainText('Padrão cliente');
  await expect(linha).toContainText('validade 31/12/2027');

  const testid = (await linha.getAttribute('data-testid'))!;
  const codigo = testid.replace('rede-linha-', '');

  // Edição: o formulário abre com o checklist preenchido e grava o novo lacre.
  await page.getByTestId(`editar-rede-${codigo}`).click();
  await expect(page.getByTestId('rede-form')).toBeVisible();
  await expect(page.getByTestId('checklist-rede-ok')).toHaveValue('true');
  await expect(page.getByTestId('checklist-lacre')).toHaveValue('004512');
  await page.getByTestId('checklist-lacre').fill('004599');
  await page.getByTestId('salvar-rede').click();
  await expect(page.getByTestId('rede-form')).toHaveCount(0);
  await expect(linha).toContainText('lacre 004599');

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

test('filtra redes por busca, condição e checklist', async ({ page }) => {
  await loginAs(page, 'OPERADOR');

  await page.goto('/wms/checklist/redes');
  await expect(page.getByRole('heading', { name: 'Redes de contenção', level: 1 })).toBeVisible();

  await page.getByTestId('buscar-redes').fill('RED-000000');
  await expect(page.locator('[data-testid^="rede-linha-"]')).toHaveCount(0);

  await page.getByTestId('buscar-redes').fill('');
  await page.getByTestId('filtro-condicao-rede').selectOption('RUIM');
  for (const linha of await page.locator('[data-testid^="rede-linha-"]').all()) {
    await expect(linha).toContainText('RUIM');
  }

  await page.getByTestId('filtro-condicao-rede').selectOption('');
  await page.getByTestId('filtro-checklist-rede').selectOption('CONCLUIDO');
  for (const linha of await page.locator('[data-testid^="rede-linha-"]').all()) {
    await expect(linha).toContainText('Checklist OK');
  }
});
