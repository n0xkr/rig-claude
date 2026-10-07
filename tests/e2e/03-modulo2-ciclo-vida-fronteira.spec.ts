import { test, expect } from '@playwright/test';
import { loginAs, preencherNovaViagem } from './helpers.js';

/** Fluxo operacional da viagem pela UI (etapas reais, com saltos permitidos). */
test('transiciona o status de uma viagem pela UI e vê a linha do tempo atualizar', async ({
  page,
}) => {
  await loginAs(page, 'OPERADOR');
  const placa = await preencherNovaViagem(page, 'Santiago/CL');
  await page.getByRole('button', { name: 'Criar viagem' }).click();
  await page.getByText(placa).first().click();

  await expect(page.getByText('Nenhuma mudança de etapa registrada ainda.')).toBeVisible();

  await page.getByTestId('viagem-proximo-status').selectOption('EM_TRANSITO_CLIENTE');
  await page.getByTestId('viagem-confirmar-status').click();
  await expect(page.getByText('Programada / agendada →')).toBeVisible();

  // Pula etapas (nem todo veículo passa por todas): direto para "aguardando pedido de cruze".
  await expect(
    page
      .getByTestId('viagem-proximo-status')
      .locator('option[value="NA_FRONTEIRA_AGUARDANDO_CRUZE"]'),
  ).toHaveCount(1);
  await page.getByTestId('viagem-proximo-status').selectOption('NA_FRONTEIRA_AGUARDANDO_CRUZE');
  await page.getByTestId('viagem-confirmar-status').click();
  await expect(page.getByText('Veículo em trânsito para o cliente →')).toBeVisible();
});

test('KPIs de fronteira: registra uma etapa e vê o painel agregado por rota/viagem', async ({
  page,
}) => {
  await loginAs(page, 'OPERADOR');
  const placa = await preencherNovaViagem(page, 'Montevidéu/UY');
  await page.getByRole('button', { name: 'Criar viagem' }).click();
  await page.getByText(placa).first().click();

  await page.getByRole('link', { name: 'Travessia de fronteira' }).click();
  await expect(page.getByText('Nenhuma etapa registrada')).toBeVisible();

  await page.getByLabel('Tempo parado (min)').fill('45');
  await page.getByLabel('Custo estimado de espera').fill('300');
  await page.getByLabel('Motivo da retenção').fill('Fila de fiscalização');
  await page.getByRole('button', { name: 'Registrar etapa' }).click();

  await expect(page.getByText('Etapa registrada com sucesso.')).toBeVisible();
  // "AGENDAMENTO" também aparece dentro do <select> de etapa — escopado à
  // lista de eventos registrados.
  await expect(page.getByRole('listitem').getByText('AGENDAMENTO')).toBeVisible();
  await expect(page.getByText('Parado: 45 min')).toBeVisible();

  await page.getByRole('link', { name: 'KPIs de fronteira' }).click();
  await expect(page.getByRole('heading', { name: 'KPIs de fronteira' })).toBeVisible();
  await expect(page.getByText('Performance por rota')).toBeVisible();
  await expect(page.getByText(placa)).toBeVisible();
});
