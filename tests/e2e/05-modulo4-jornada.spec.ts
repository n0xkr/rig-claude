import { test, expect } from '@playwright/test';
import { loginAs, apiLogin, apiCreateMotorista } from './helpers.js';

/**
 * Módulo 4 — Controle de Jornada. Pré-requisito honesto: cadastro de
 * motorista não tem NENHUMA tela própria neste app (só a API tem
 * `POST /motoristas` — ver README/relatório final), então é criado aqui
 * via API antes do cenário real, que roda inteiramente pela UI.
 */
test('registra um evento de jornada e vê o motorista nos alertas de conformidade', async ({
  page,
  request,
}) => {
  const token = await apiLogin(request, 'OPERADOR');
  const motoristaId = await apiCreateMotorista(request, token);

  await loginAs(page, 'OPERADOR');
  await page.goto('/jornada');

  await page.getByLabel('Motorista *').selectOption(motoristaId);
  await page.getByLabel('Tipo de evento *').selectOption('INICIO_JORNADA');
  await page.getByRole('button', { name: 'Registrar evento' }).click();

  await expect(page.getByText('Evento registrado com sucesso.')).toBeVisible();
  // "INICIO JORNADA" também aparece dentro do <select> (opção selecionada),
  // então a asserção é escopada à lista de eventos recentes.
  const eventosRecentes = page.getByRole('list').last();
  await expect(eventosRecentes.getByText('INICIO JORNADA')).toBeVisible();

  // Um segundo evento (início de direção) para termos uma sessão em aberto
  // o suficiente para o motor de conformidade reconstruir e, se acima do
  // limite configurado de "atividade recente", aparecer no painel de
  // alertas (mesma lógica coberta por jornadaCompliance.test.ts).
  await page.getByLabel('Tipo de evento *').selectOption('INICIO_DIRECAO');
  await page.getByRole('button', { name: 'Registrar evento' }).click();
  await expect(eventosRecentes.getByText('INICIO DIRECAO')).toBeVisible();

  await page.getByRole('link', { name: 'Alertas de conformidade' }).click();
  await expect(page.getByRole('heading', { name: /alertas/i })).toBeVisible();
});
