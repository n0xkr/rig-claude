import pino from 'pino';
import { env } from './env.js';

/**
 * Logger estruturado em JSON (critério #9). Em desenvolvimento usa
 * pino-pretty para legibilidade; em produção emite JSON puro para ser
 * coletado por um agregador (ex: Loki, CloudWatch, Datadog).
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { module: 'rigabras-api' },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
});
