import { defineConfig, devices } from '@playwright/test';

/**
 * Configuração Playwright deste sandbox de testes. Roda contra a API e o
 * web reais (`apps/api`/`apps/web`), ambos já em execução (ver README, seção
 * "Testes") — os `webServer` abaixo sobem os dois automaticamente quando o
 * runner não os encontra de pé, com `USE_FAKE_DB=true` na API (ver
 * `apps/api/src/config/fakeSupabase.ts`): não há Docker disponível neste
 * sandbox para rodar um Supabase local real, então o backend usa um cliente
 * Supabase falso em memória com a MESMA API encadeável do
 * `@supabase/supabase-js` — todo o código real de rota/controller/service/
 * repository roda sem alteração, só o I/O muda. RLS/migrations continuam
 * sem verificação contra um Postgres real (ressalva pré-existente do
 * projeto, documentada no README desde antes desta sessão).
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @rigabras/api dev',
      url: 'http://127.0.0.1:3333/healthz',
      reuseExistingServer: true,
      timeout: 30_000,
      // WEB_ORIGIN precisa bater exatamente com a origem usada pelo
      // Chromium do Playwright (baseURL abaixo) — um mismatch
      // localhost/127.0.0.1 aqui faz o CORS da API bloquear a resposta do
      // fetch do browser (bug real encontrado rodando esta suíte pela
      // primeira vez: login sempre falhava com "Falha ao entrar", porque o
      // `.env` da API tinha `WEB_ORIGIN=http://localhost:5173`).
      env: { USE_FAKE_DB: 'true', WEB_ORIGIN: 'http://127.0.0.1:5173' },
    },
    {
      command: 'pnpm --filter @rigabras/web dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
