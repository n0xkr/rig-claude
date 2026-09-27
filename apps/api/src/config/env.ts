import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Carregador de `.env` minimalista, sem dependência externa (bug real
 * encontrado nesta sessão: o projeto nunca teve nenhum mecanismo de leitura
 * de `.env` — nem `dotenv`, nem `node --env-file` nos scripts — então
 * `pnpm --filter @rigabras/api dev` sempre falhava com "Required" para toda
 * variável, mesmo com um `.env` presente. Corrigido aqui em vez de exigir
 * que o operador exporte manualmente cada variável no shell). Nunca
 * sobrescreve uma variável já definida no ambiente (env real do processo/CI
 * sempre tem prioridade sobre o arquivo).
 */
function loadDotEnv(): void {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

/**
 * Validação de variáveis de ambiente no boot (critério #11): a aplicação
 * encerra imediatamente com uma mensagem clara caso falte alguma variável
 * obrigatória. GROQ_API_KEY é tratada como opcional em runtime (o wrapper de
 * IA faz graceful-degrade), mas ainda validada quanto ao formato se presente.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  SUPABASE_URL: z.string().min(1, 'SUPABASE_URL é obrigatório'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY é obrigatório'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY é obrigatório'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET deve ter ao menos 16 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET deve ter ao menos 16 caracteres'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET deve ter ao menos 16 caracteres'),

  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),

  REDIS_URL: z.string().optional(),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),

  /**
   * Quando `true`, `config/supabase.ts` usa um cliente Supabase falso em
   * memória (`config/fakeSupabase.ts`) em vez do `@supabase/supabase-js`
   * real. Existe exclusivamente para dev local/testes sem Docker disponível
   * (ver docs/NOTES.md e README, seção "Testes") — nunca deve ser `true` em
   * produção.
   */
  USE_FAKE_DB: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Falha ao validar variáveis de ambiente na inicialização:');
    for (const issue of parsed.error.issues) {
      // eslint-disable-next-line no-console
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

export const isGroqConfigured = Boolean(
  env.GROQ_API_KEY && env.GROQ_API_KEY !== 'your-groq-api-key-here',
);
