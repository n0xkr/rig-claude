import { test, expect } from '@playwright/test';
import { loginAs, preencherNovaViagem } from './helpers.js';

const TODOS_STATUS_ATE_ENTREGUE = [
  'EM_TRANSITO_CLIENTE',
  'CARREGADO_AGUARDANDO_DOCUMENTOS',
  'EM_TRANSITO_FRONTEIRA',
  'SAIDA_ADUANA_COTECAR',
  'CHEGADA_CLIENTE',
  'VAZIO_NO_CLIENTE',
];

test('registra o frete de uma viagem entregue, roda o fechamento e confere o saldo', async ({
  page,
}) => {
  await loginAs(page, 'OPERADOR');
  const placa = await preencherNovaViagem(page, 'Buenos Aires/AR');
  await page.getByRole('button', { name: 'Criar viagem' }).click();
  await page.getByText(placa).first().click();

  // Avança a viagem pela UI (controle adicionado nesta sessão — ver
  // 03-modulo2-ciclo-vida-fronteira.spec.ts) até "Vazio no cliente" (carga entregue): só então o
  // registro do frete contratado é permitido (regra de negócio do Módulo 3).
  for (const status of TODOS_STATUS_ATE_ENTREGUE) {
    // O botão fica desabilitado de novo logo após cada clique (o select
    // volta a "Selecione..." quando a transição é bem-sucedida) — em vez de
    // esperar ele reabilitar, espera a opção do PRÓXIMO status aparecer no
    // <select>, o que só acontece depois que `reload()` trouxe o novo
    // `viagem.status` da API.
    await expect(
      page.getByTestId('viagem-proximo-status').locator(`option[value="${status}"]`),
    ).toHaveCount(1);
    await page.getByTestId('viagem-proximo-status').selectOption(status);
    await page.getByTestId('viagem-confirmar-status').click();
  }

  await page.getByRole('link', { name: 'Fechamento financeiro do frete' }).click();
  await expect(
    page.getByText('Esta viagem ainda não tem um frete contratado registrado.'),
  ).toBeVisible();

  await page.getByLabel('Valor contratado (R$) *').fill('18500');
  await page.getByRole('button', { name: 'Registrar frete' }).click();

  await expect(page.getByRole('heading', { name: 'Fechamento do frete' })).toBeVisible();
  await expect(page.getByText('Saldo devido:')).toBeVisible();
  await expect(page.getByText('R$ 18.500,00').first()).toBeVisible();
  const freteUrl = page.url();

  // OPERADOR conduz a conferência operacional (ABERTO -> EM_CONFERENCIA).
  await page.getByRole('button', { name: 'Enviar para conferência operacional' }).click();
  await expect(page.getByText('Status alterado para Em conferência.')).toBeVisible();

  // Aprovação financeira e pagamento exigem ADMIN/SUPERADMIN (RBAC por
  // transição, critério #4 do Módulo 3) — troca de sessão pela UI de verdade.
  await page.getByTestId('logout-button').click();
  await loginAs(page, 'ADMIN');
  await page.goto(freteUrl);

  await page.getByRole('button', { name: 'Aprovar financeiramente' }).click();
  await expect(page.getByText('Status alterado para Aprovado financeiramente.')).toBeVisible();

  // Quita o saldo integralmente para poder concluir o pagamento (a
  // transição para PAGO exige saldo <= 0 — regra de negócio real do
  // backend, não simulada).
  await page.getByPlaceholder('Valor pago (R$)').fill('18500');
  await page.getByRole('button', { name: 'Registrar pagamento' }).click();
  await expect(page.getByText('R$ 18.500,00').first()).toBeVisible();

  await page.getByRole('button', { name: 'Confirmar pagamento' }).click();
  await expect(page.getByText('Status alterado para Pago.')).toBeVisible();
  await expect(page.getByText('Saldo devido:')).toBeVisible();
  await expect(page.getByText('R$ 0,00').first()).toBeVisible();
});
