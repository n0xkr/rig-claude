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
 * Flag booleana tolerante (true/false, 1/0, sim/não, on/off). Valor
 * irreconhecível cai no padrão em vez de derrubar o boot — usada só nas
 * variáveis opcionais da IA.
 */
function flagEnv(padrao: boolean) {
  return z
    .string()
    .optional()
    .transform((v) => {
      const s = v?.trim().toLowerCase();
      if (!s) return padrao;
      if (['true', '1', 'sim', 'yes', 'on'].includes(s)) return true;
      if (['false', '0', 'nao', 'não', 'no', 'off'].includes(s)) return false;
      return padrao;
    });
}

/**
 * Inteiro opcional tolerante para as variáveis da IA: vazio = ausente e valor
 * inválido/fora da faixa cai no padrão (um typo no painel do Coolify não pode
 * derrubar a API inteira por causa de um limite de IA).
 */
function intEnvOpcional(min: number, max: number) {
  return z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce.number().int().min(min).max(max).optional().catch(undefined),
  );
}

function intEnv(min: number, max: number, padrao: number) {
  return intEnvOpcional(min, max).transform((n) => n ?? padrao);
}

/**
 * Validação de variáveis de ambiente no boot (critério #11): a aplicação
 * encerra imediatamente com uma mensagem clara caso falte alguma variável
 * obrigatória. GROQ_API_KEY é tratada como opcional em runtime (o wrapper de
 * IA faz graceful-degrade), mas ainda validada quanto ao formato se presente.
 */
const EnvSchema = z
  .object({
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
    // `llama-3.3-70b-versatile` foi descontinuado pela Groq (a API passou a
    // responder 404 "model_not_found" para ele) — encontrado ao testar o
    // RIGABRAS AI (Módulo 10) nesta sessão. `openai/gpt-oss-120b` é o modelo
    // de texto de propósito geral atualmente disponível na conta usada por
    // este projeto (verificado via GET /openai/v1/models da Groq).
    GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
    /** Modelo com visão (lê fotos de CNH/CRLV no OCR de motoristas). */
    GROQ_VISION_MODEL: z.string().default('meta-llama/llama-4-scout-17b-16e-instruct'),

    // ---- Camada de IA (lib/ai) — todas opcionais, com defaults seguros ----
    /** Modelo "rápido" para classificar/mapear (importação, solicitações). */
    GROQ_FAST_MODEL: z.string().default('openai/gpt-oss-20b'),
    /** Reservas extras (vírgula) antes da lista conhecida, para 404/model_not_found. */
    GROQ_TEXT_FALLBACK_MODELS: z.string().default(''),
    GROQ_VISION_FALLBACK_MODELS: z.string().default(''),
    /** Kill switch global da IA (as regras determinísticas continuam). */
    IA_HABILITADA: flagEnv(true),
    /** Kill switch do OCR (LGPD: desliga a transferência de documentos sem desligar o resto da IA). */
    IA_OCR_HABILITADO: flagEnv(true),
    IA_IMPORTACAO_HABILITADO: flagEnv(true),
    IA_SOLICITACOES_HABILITADO: flagEnv(true),
    IA_INSIGHTS_HABILITADO: flagEnv(true),
    IA_CHATBOT_HABILITADO: flagEnv(true),
    IA_RISCO_HABILITADO: flagEnv(true),
    /** Tarefas ou famílias desligadas (vírgula), ex.: "importacao.status,insights". */
    IA_TAREFAS_DESABILITADAS: z.string().default(''),
    /** Sobrescreve o prazo padrão de TODAS as famílias (ms). */
    IA_TIMEOUT_MS: intEnvOpcional(1000, 300_000),
    /** Retentativas por modelo em 5xx/rede/timeout. */
    IA_RETENTATIVAS: intEnv(0, 5, 2),
    /** Chamadas simultâneas à IA no processo. */
    IA_CONCORRENCIA: intEnv(1, 32, 4),
    /** Sobrescrevem os limites por usuário/família de TODAS as famílias (0 = sem limite). */
    IA_LIMITE_MINUTO_USUARIO: intEnvOpcional(0, 100_000),
    IA_LIMITE_DIA_USUARIO: intEnvOpcional(0, 10_000_000),
    /** Limites por família, ex.: "ocr=10/200;chatbot=15/300" (por minuto / por dia). */
    IA_LIMITES: z.string().default(''),
    /** Tetos globais diários (todas as pessoas somadas; 0 = sem limite). */
    IA_LIMITE_DIA_GLOBAL: intEnv(0, 10_000_000, 5000),
    IA_TOKENS_DIA_GLOBAL: intEnv(0, 1_000_000_000, 5_000_000),
    /** Disjuntor: falhas seguidas até pular a IA, e por quanto tempo (ms). */
    IA_DISJUNTOR_FALHAS: intEnv(0, 100, 5),
    IA_DISJUNTOR_PAUSA_MS: intEnv(1000, 3_600_000, 60_000),
    IA_CACHE_MAX_ENTRADAS: intEnv(0, 100_000, 500),
    /** Cache persistente na tabela ia_cache (nunca para OCR); exige a tabela. */
    IA_CACHE_PERSISTENTE: flagEnv(false),
    /** Grava uma linha por chamada na tabela ia_uso (sem conteúdo); exige a tabela. */
    IA_PERSISTIR_USO: flagEnv(false),
    /** Sob vitest a IA real fica desligada; `true` libera a Groq de verdade nos testes. */
    IA_TESTES_HABILITADA: flagEnv(false),

    /**
     * E-mails (separados por vírgula) autorizados a ver a trilha de Auditoria.
     * A auditoria é restrita a pessoas específicas — nem o papel SUPERADMIN a vê.
     */
    AUDITORIA_EMAILS: z.string().default(''),

    /** Nº de proxies reversos à frente da API (ex.: 1 com Traefik). Padrão 0 (não confia em X-Forwarded-For); obrigatório em produção. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).optional(),

    /**
     * Autocadastro em /auth/register. Recomendado `false` em produção: o SUPERADMIN cria os
     * usuários em /usuarios. Padrão `true` mantém o comportamento anterior.
     */
    ALLOW_PUBLIC_REGISTRATION: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

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
  })
  .superRefine((cfg, ctx) => {
    const placeholder = /(change-?me|your-|example|placeholder|default|^secret$|^changeme$|xxxx)/i;
    const exigirReal = (campo: string, valor: string | undefined) => {
      if (valor && placeholder.test(valor)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [campo],
          message: 'valor de exemplo/placeholder não é permitido em produção',
        });
      }
    };
    if (cfg.NODE_ENV === 'production') {
      for (const campo of [
        'JWT_ACCESS_SECRET',
        'JWT_REFRESH_SECRET',
        'COOKIE_SECRET',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_ANON_KEY',
      ] as const) {
        exigirReal(campo, cfg[campo]);
      }
      exigirReal('GROQ_API_KEY', cfg.GROQ_API_KEY);
      for (const campo of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
        if (cfg[campo].length < 32) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [campo],
            message: 'deve ter ao menos 32 caracteres em produção',
          });
        }
      }
      if (cfg.JWT_ACCESS_SECRET === cfg.JWT_REFRESH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'deve ser diferente de JWT_ACCESS_SECRET',
        });
      }
      if (cfg.TRUST_PROXY_HOPS === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['TRUST_PROXY_HOPS'],
          message: 'obrigatório em produção (nº de proxies à frente da API; 0 se nenhum)',
        });
      }
      if (/localhost|127\.0\.0\.1/.test(cfg.WEB_ORIGIN)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['WEB_ORIGIN'],
          message: 'deve apontar para a origem real do web em produção',
        });
      }
      try {
        new URL(cfg.SUPABASE_URL);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SUPABASE_URL'],
          message: 'URL inválida',
        });
      }
    }
    if (cfg.NODE_ENV === 'production' && cfg.USE_FAKE_DB) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['USE_FAKE_DB'],
        message:
          'USE_FAKE_DB=true não é permitido em produção (banco em memória, sem persistência)',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
     
    console.error('Falha ao validar variáveis de ambiente na inicialização:');
    for (const issue of parsed.error.issues) {
       
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

/** Emissor/audiência dos JWTs da API (validados em verify). */
export const JWT_ISSUER = 'rigabras-api';
export const JWT_AUDIENCE = 'rigabras-web';

export const isGroqConfigured = Boolean(
  env.GROQ_API_KEY && env.GROQ_API_KEY !== 'your-groq-api-key-here',
);
