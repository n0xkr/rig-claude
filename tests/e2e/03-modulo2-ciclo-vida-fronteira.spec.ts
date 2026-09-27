import { test, expect } from '@playwright/test';
import { loginAs, randomPlaca } from './helpers.js';

/**
 * Módulo 2 (TMS Operacional). Nota sobre um gap real encontrado nesta
 * sessão: `ViagemDetailPage` já lia o histórico de status
 * (`useViagemStatusHistory`), mas nenhuma tela tinha um controle para de
 * fato mudar o status (`PATCH /viagens/:id/status` só era chamado pelo
 * fluxo do Módulo 6/testes de API, nunca pela UI). Foi adicionado um
 * controle mínimo "Avançar status da viagem" em `ViagemDetailPage.tsx`
 * (select + botão, usando a mesma `TRANSICOES_STATUS_VIAGEM` do backend)
 * para fechar esse gap e permitir testar esse fluxo pela UI de verdade.
 */
test('transiciona o status de uma viagem pela UI e vê a linha do tempo atualizar', async ({
  page,
}) => {
  await loginAs(page, 'OPERADOR');
  await page.getByRole('link', { name: 'Nova viagem' }).click();
  const placa = randomPlaca();
  await page.getByLabel('Placa do cavalo *').fill(placa);
  await page.getByLabel('Origem *').fill('Uruguaiana/RS');
  await page.getByLabel('Destino *', { exact: true }).fill('Santiago/CL');
  await page.getByRole('button', { name: 'Criar viagem' }).click();
  await page.getByText(placa).click();

  await expect(page.getByText('Nenhuma transição de status registrada ainda.')).toBeVisible();

  await page.getByTestId('viagem-proximo-status').selectOption('AGUARDANDO_COLETA');
  await page.getByTestId('viagem-confirmar-status').click();

  await expect(page.getByText('PROGRAMADA →')).toBeVisible();
  await expect(page.getByText('AGUARDANDO COLETA').first()).toBeVisible();

  // Uma segunda transição confirma que a máquina de estados avança de novo
  // (e não fica presa mostrando sempre a primeira linha do histórico).
  await page.getByTestId('viagem-proximo-status').selectOption('EM_COLETA');
  await page.getByTestId('viagem-confirmar-status').click();
  await expect(page.getByText('AGUARDANDO COLETA →')).toBeVisible();
});

test('KPIs de fronteira: registra uma etapa e vê o painel agregado por rota/viagem', async ({
  page,
}) => {
  await loginAs(page, 'OPERADOR');
  await page.getByRole('link', { name: 'Nova viagem' }).click();
  const placa = randomPlaca();
  await page.getByLabel('Placa do cavalo *').fill(placa);
  await page.getByLabel('Origem *').fill('Uruguaiana/RS');
  await page.getByLabel('Destino *', { exact: true }).fill('Montevidéu/UY');
  await page.getByRole('button', { name: 'Criar viagem' }).click();
  await page.getByText(placa).click();

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
