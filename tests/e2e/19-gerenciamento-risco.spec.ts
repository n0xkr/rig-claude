import { test, expect } from '@playwright/test';
import { loginAs, preencherNovaViagem } from './helpers.js';

/**
 * TMS — menu "Gerenciamento de Risco": registro de viagens com as 5
 * marcações de liberação (perfil segurança, conjunto validado, checklist,
 * autorização de embarque, autorização enviada ao motorista) + rota do
 * motorista (link de rota com pedágios). Evidências ficam no audit log do
 * PATCH /viagens/:id (rastreabilidade ISO 9001).
 */
test('marca e desmarca as 5 liberações da viagem pelo Gerenciamento de Risco', async ({ page }) => {
  await loginAs(page, 'OPERADOR');
  await expect(page.getByRole('link', { name: 'Gerenciamento de Risco' })).toBeVisible();

  const placa = await preencherNovaViagem(page, 'Posadas/AR');
  await page.getByLabel('Mercadoria (geral)').fill('Grãos PW Risco');
  await page.getByTestId('viagem-salvar').click();
  await expect(page).toHaveURL(/\/viagens$/);

  await page.goto('/riscos');
  await expect(page.getByRole('heading', { name: 'Gerenciamento de Risco', level: 1 })).toBeVisible();
  const card = page.getByTestId(`risco-card-${placa}`);
  await expect(card).toBeVisible();
  const progresso = page.getByTestId(`risco-progresso-${placa}`);
  await expect(progresso).toHaveText('0/5');

  // Sem rota cadastrada: link gerado (Google Maps) origem → destino.
  const rota = page.getByTestId(`risco-rota-${placa}`);
  await expect(rota).toHaveAttribute('href', /google\.com\/maps\/dir/);

  const marcas = [
    'perfil_seguranca_ok',
    'conjunto_validado_ok',
    'checklist_ok',
    'autorizacao_embarque_ok',
    'autorizacao_motorista_enviada',
  ] as const;
  for (let i = 0; i < marcas.length; i += 1) {
    await card.getByTestId(`risco-${marcas[i]}`).click();
    await expect(progresso).toHaveText(`${i + 1}/5`);
  }
  await expect(page.getByTestId('riscos-liberadas')).not.toHaveText('0');
  await expect(page.getByTestId('riscos-pendentes')).toBeVisible();

  // Persistência: recarrega a página e as marcações continuam.
  await page.reload();
  await expect(page.getByTestId(`risco-progresso-${placa}`)).toHaveText('5/5');

  // Desmarcação volta o progresso (toggle nos dois sentidos).
  await card.getByTestId('risco-autorizacao_motorista_enviada').click();
  await expect(progresso).toHaveText('4/5');
});

test('salva a rota do motorista no formulário e ela aparece no gerenciamento de risco', async ({ page }) => {
  await loginAs(page, 'OPERADOR');
  const placa = await preencherNovaViagem(page, 'Porto Alegre/RS');
  await page.getByTestId('viagem-salvar').click();
  await expect(page).toHaveURL(/\/viagens$/);

  await page.goto('/riscos');
  const card = page.getByTestId(`risco-card-${placa}`);
  await expect(card).toBeVisible();
  await card.getByRole('link', { name: 'Editar viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]+\/editar$/);

  await page.getByTestId('viagem-rota-motorista').fill('https://maps.app.golang/riscos-pw');
  await page.getByTestId('viagem-salvar').click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]+$/);

  await page.goto('/riscos');
  await expect(page.getByTestId(`risco-rota-${placa}`)).toHaveAttribute(
    'href',
    'https://maps.app.golang/riscos-pw',
  );
});
