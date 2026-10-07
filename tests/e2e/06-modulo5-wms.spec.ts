import { test, expect } from '@playwright/test';
import { loginAs, apiLogin, apiGetArmazemId, apiCreateEndereco } from './helpers.js';

/**
 * Módulo 5 — WMS. Pré-requisito honesto: endereços de armazém (bins) não
 * têm tela própria de cadastro neste app (só `POST /wms/enderecos` na API),
 * então o endereço usado na conferência é criado aqui via API. O restante
 * do workflow (depositante, produto, recebimento, conferência) roda 100%
 * pela UI real.
 */
test('cria depositante e produto, registra um recebimento e conclui a conferência com endereçamento', async ({
  page,
  request,
}) => {
  const token = await apiLogin(request, 'OPERADOR');
  const armazemId = await apiGetArmazemId(request, token);
  await apiCreateEndereco(request, token, armazemId);

  await loginAs(page, 'OPERADOR');

  await page.goto('/wms/depositantes');
  await page.getByRole('link', { name: /novo depositante/i }).click();
  const razaoSocial = `Cliente Playwright ${Date.now()}`;
  await page.getByLabel('Razão social *').fill(razaoSocial);
  await page.getByLabel('CNPJ/CPF *').fill('12.345.678/0001-99');
  await page.getByRole('button', { name: 'Cadastrar depositante' }).click();
  await expect(page).toHaveURL(/\/wms\/depositantes$/);
  await expect(page.getByText(razaoSocial)).toBeVisible();

  await page.goto('/wms/produtos');
  await page.getByRole('button', { name: 'Novo produto' }).click();
  // A página tem um <select> de filtro fora do <form> (Todos os
  // depositantes) além do <select> do próprio formulário de criação —
  // escopar pelo <form> evita pegar o filtro por engano.
  await page.locator('form').getByRole('combobox').selectOption({ label: razaoSocial });
  const sku = `SKU-${Date.now()}`;
  await page.getByPlaceholder('SKU').fill(sku);
  await page.getByPlaceholder('Descrição').fill('Caixa de teste Playwright');
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  await expect(page.getByText(sku)).toBeVisible();

  await page.goto('/wms/recebimentos');
  await page.getByRole('link', { name: /novo recebimento/i }).click();
  await page.getByLabel('Depositante *').selectOption({ label: razaoSocial });
  // O select de produto do item não tem um <label> associado no markup
  // (só o de Depositante tem) — localizado por posição (segundo combobox).
  await page
    .getByRole('combobox')
    .nth(1)
    .selectOption({ label: `${sku} — Caixa de teste Playwright` });
  await page.locator('input[placeholder="Qtd."]').fill('10');
  await page.getByRole('button', { name: 'Registrar recebimento' }).click();

  await expect(page.getByRole('button', { name: 'Iniciar conferência' })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar conferência' }).click();
  // O botão só some quando `recebimento.status` deixa de ser 'AGUARDANDO'
  // (depois do `reload()` pós-transição) — só então o input de quantidade
  // conferida deixa de estar desabilitado.
  await expect(page.getByRole('button', { name: 'Iniciar conferência' })).toHaveCount(0);

  await expect(page.getByText('Esperado:')).toBeVisible();
  await page.locator('input[type="number"]').first().fill('10');
  await page.getByRole('combobox').last().selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Conferir' }).click();

  await expect(page.getByText('conferido: 10')).toBeVisible();
  await page.getByRole('button', { name: 'Concluir conferência' }).click();
  // Status final do recebimento (badge de status do cabeçalho, não o texto
  // "conferido: 10" do item, que também bate num regex mais amplo).
  await expect(page.getByText('ENDERECADO', { exact: true })).toBeVisible();
});
