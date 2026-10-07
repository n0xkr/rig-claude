import { test, expect } from '@playwright/test';
import { loginAs, preencherNovaViagem } from './helpers.js';

/**
 * Fila offline-first (IndexedDB, `apps/web/src/offline/syncManager.ts`):
 * cria uma viagem com o navegador offline (emulação real do Playwright,
 * `context.setOffline`), confirma que ela foi enfileirada localmente (nunca
 * chega a bater na API), depois volta a ficar online e confirma que a
 * sincronização automática (`window.addEventListener('online', ...)`)
 * realmente enviou a mutação para a API real e o registro passou a existir
 * no servidor.
 */
test('cria uma viagem offline e sincroniza automaticamente ao voltar online', async ({
  page,
  context,
}) => {
  await loginAs(page, 'OPERADOR');

  // Veículos e motoristas do formulário carregam ANTES de ficar offline.
  const placa = await preencherNovaViagem(page, 'Ciudad del Este/PY');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Criar viagem' }).click();

  await expect(
    page.getByText('Sem conexão: viagem salva localmente e será sincronizada automaticamente.'),
  ).toBeVisible();
  // Continua na tela do formulário (o fluxo online navegaria para /viagens).
  await expect(page).toHaveURL(/\/viagens\/nova$/);

  await context.setOffline(false);

  // `trySync()` roda no evento `online` do navegador — Playwright dispara
  // esse evento ao voltar online, o que já chama `trySync()` de verdade;
  // não simulamos a sincronização, só esperamos ela acontecer.
  await page.goto('/viagens');
  await expect(page.getByText(placa)).toBeVisible({ timeout: 10_000 });
});
