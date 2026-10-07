import { test, expect } from '@playwright/test';
import { loginAs, apiLogin, apiGetArmazemId, apiCreateEndereco } from './helpers.js';

/**
 * Módulo 5 — Estoque (WMS): lançamento manual de entrada/saída no ledger
 * `movimentacoes_estoque`, saldo materializado por endereço e histórico de
 * movimentações. Depósito, produto e endereço são preparados aqui (produto e
 * depositante pela UI real; endereço via API, que não tem tela própria).
 */
test('lança entrada e saída manuais no estoque e reflete saldo e histórico do ledger', async ({
  page,
  request,
}) => {
  const token = await apiLogin(request, 'OPERADOR');
  const armazemId = await apiGetArmazemId(request, token);
  const enderecoId = await apiCreateEndereco(request, token, armazemId);

  const docEntrada = `NF-ENT-${Date.now()}`;
  const docSaida = `ROM-SAID-${Date.now()}`;

  await loginAs(page, 'OPERADOR');

  await page.goto('/wms/depositantes');
  await page.getByRole('link', { name: /novo depositante/i }).click();
  const razaoSocial = `Estoque PW ${Date.now()}`;
  await page.getByLabel('Razão social *').fill(razaoSocial);
  await page.getByLabel('CNPJ/CPF *').fill('98.765.432/0001-10');
  await page.getByRole('button', { name: 'Cadastrar depositante' }).click();
  await expect(page).toHaveURL(/\/wms\/depositantes$/);

  await page.goto('/wms/produtos');
  await page.getByRole('button', { name: 'Novo produto' }).click();
  await page.locator('form').getByRole('combobox').selectOption({ label: razaoSocial });
  const sku = `EST-${Date.now()}`;
  await page.getByPlaceholder('SKU').fill(sku);
  await page.getByPlaceholder('Descrição').fill('Palete de teste de estoque');
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  await expect(page.getByText(sku)).toBeVisible();

  await page.goto('/wms/estoque');
  await expect(page.getByRole('heading', { name: 'Estoque', level: 1 })).toBeVisible();

  // Primeira entrada: cria o saldo a partir do zero (sem saldo prévio na tela).
  await page.getByTestId('nova-movimentacao').click();
  await expect(page.getByTestId('movimentacao-form')).toBeVisible();
  await page.getByTestId('movimentacao-produto').selectOption({ label: `${sku} — Palete de teste de estoque` });
  await page.getByTestId('movimentacao-quantidade').fill('10');
  await page.getByTestId('movimentacao-documento').fill(docEntrada);
  await page.getByTestId('movimentacao-destino').selectOption(enderecoId);
  await page.getByTestId('lancar-movimentacao').click();

  const linha = page.getByTestId('estoque-linha').filter({ hasText: sku });
  await expect(linha).toHaveCount(1);
  await expect(linha).toContainText('10');

  // Saída parcial a partir da própria linha de saldo.
  await linha.getByTestId('saida-btn').click();
  await page.getByTestId('movimentacao-quantidade').fill('4');
  await page.getByTestId('movimentacao-documento').fill(docSaida);
  await page.getByTestId('lancar-movimentacao').click();

  await expect(linha).toContainText('6');

  // Histórico do ledger (entrada e saída lançadas nesta sessão).
  await expect(page.getByText('Endereçamento (entrada)').first()).toBeVisible();
  await expect(page.getByText('Separação (saída)').first()).toBeVisible();
  await expect(page.getByText(docEntrada)).toBeVisible();
  await expect(page.getByText(docSaida)).toBeVisible();
});

test('edita um SKU do catálogo pela tela (cadastro e edição de itens do estoque)', async ({
  page,
}) => {
  await loginAs(page, 'OPERADOR');

  await page.goto('/wms/depositantes');
  await page.getByRole('link', { name: /novo depositante/i }).click();
  const razaoSocial = `Edição PW ${Date.now()}`;
  await page.getByLabel('Razão social *').fill(razaoSocial);
  await page.getByLabel('CNPJ/CPF *').fill('11.222.333/0001-44');
  await page.getByRole('button', { name: 'Cadastrar depositante' }).click();

  await page.goto('/wms/produtos');
  await page.getByRole('button', { name: 'Novo produto' }).click();
  await page.locator('form').getByRole('combobox').selectOption({ label: razaoSocial });
  const sku = `ED-${Date.now()}`;
  await page.getByPlaceholder('SKU').fill(sku);
  await page.getByPlaceholder('Descrição').fill('Descrição original');
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  await expect(page.getByText(sku)).toBeVisible();

  await page.getByTestId(`editar-produto-${sku}`).click();
  const form = page.getByTestId('produto-edit-form');
  await expect(form).toBeVisible();
  const descricaoEditada = `Descrição editada ${Date.now()}`;
  await form.getByPlaceholder('Descrição').fill(descricaoEditada);
  await form.getByRole('button', { name: 'Salvar alterações' }).click();

  await expect(page.getByText(descricaoEditada)).toBeVisible();
  await expect(page.getByTestId('produto-edit-form')).toHaveCount(0);
});
