import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { supabaseAdmin } from './config/supabase.js';
import { registerCorrelationId } from './middleware/correlationId.js';
import { registerRoutes } from './routes/index.js';
import { Problems, sendProblem } from './lib/problemDetails.js';
import { pgErrorToProblem } from './lib/pgErrors.js';
import { DomainError } from './lib/errors.js';
import { isGroqConfigured } from './config/env.js';
import { registerIdempotency } from './middleware/idempotency.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
          : undefined,
    },
    disableRequestLogging: false,
    // Atrás de proxy reverso (Coolify/Traefik) o IP real vem de X-Forwarded-For. Defina
    // TRUST_PROXY_HOPS com o nº de proxies à frente da API para não aceitar IP forjado.
    // (o Fastify aceita número de saltos em runtime, mas a tipagem só declara boolean/string)
    trustProxy: (env.TRUST_PROXY_HOPS ?? 0) as unknown as boolean,
    genReqId: () => crypto.randomUUID(),
  });

  registerCorrelationId(app);
  registerIdempotency(app);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
      },
    },
    hsts: { maxAge: 15552000, includeSubDomains: true },
  });

  await app.register(cookie, { secret: env.COOKIE_SECRET });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    // Só em dev/teste (a suíte e2e faz muitos logins em 127.0.0.1). Em produção nada é isento:
    // com trustProxy, um `X-Forwarded-For: 127.0.0.1` forjado burlaria o limite do login.
    allowList: env.NODE_ENV === 'production' ? [] : ['127.0.0.1', '::1'],
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', env.WEB_ORIGIN);
    reply.header('Access-Control-Allow-Credentials', 'true');
    reply.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Correlation-Id, Idempotency-Key',
    );
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    if (request.method === 'OPTIONS') {
      reply.status(204).send();
    }
  });

  // PostgrestError não é `instanceof Error`: quando um controller faz `throw error`
  // com o objeto cru, o Fastify NÃO o entrega ao setErrorHandler — serializa o
  // objeto como JSON com status 500. Este hook o converte em problem details
  // (409/422/400) antes da serialização.
  app.addHook('preSerialization', async (request, reply, payload) => {
    if (reply.statusCode < 500) return payload;
    const pgProblem = pgErrorToProblem(payload);
    if (!pgProblem) return payload;
    logger.warn(
      { err: payload, correlationId: request.id, url: request.url },
      'Erro de banco mapeado',
    );
    reply.status(pgProblem.status).type('application/problem+json');
    return {
      type: 'about:blank',
      title: pgProblem.title,
      status: pgProblem.status,
      detail: pgProblem.detail,
      instance: request.url,
      correlationId: request.id,
    };
  });

  // --------------------------------------------------------------------
  // Health checks (critério #5): /healthz = liveness, /readyz = conectividade
  // --------------------------------------------------------------------
  app.get('/healthz', async (_request, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/readyz', async (_request, reply) => {
    try {
      const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
      if (error) throw error;
      return reply.send({
        status: 'ready',
        database: 'connected',
        groq: isGroqConfigured ? 'configured' : 'not_configured',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error }, 'Falha no readyz - banco de dados inacessível');
      return reply.status(503).send({
        status: 'not_ready',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      });
    }
  });

  await registerRoutes(app);

  app.setNotFoundHandler((request, reply) => {
    Problems.notFound(reply, `Rota ${request.method} ${request.url} não existe`);
  });

  app.setErrorHandler((error: Error, request, reply) => {
    if (reply.sent) return;
    // Erros de domínio que escaparem do handler local de um controller chegam aqui:
    // devolve o status problem+json do DomainError em vez de 500 genérico.
    if (error instanceof DomainError) {
      logger.warn(
        { err: error, correlationId: request.id, url: request.url },
        'Erro de domínio não tratado pelo controller',
      );
      sendProblem(reply, error.status, error.message, error.detail);
      return;
    }
    // Violações de unique/FK/check e uuid inválido vindas do Postgres chegam aqui
    // como PostgrestError (não é `Error`): devolve 409/422/400 em vez de 500.
    const pgProblem = pgErrorToProblem(error);
    if (pgProblem) {
      logger.warn(
        { err: error, correlationId: request.id, url: request.url },
        'Erro de banco mapeado',
      );
      sendProblem(reply, pgProblem.status, pgProblem.title, pgProblem.detail);
      return;
    }
    logger.error({ err: error, correlationId: request.id, url: request.url }, 'Erro não tratado');
    Problems.internal(reply, env.NODE_ENV === 'development' ? error.message : undefined);
  });

  return app;
}
