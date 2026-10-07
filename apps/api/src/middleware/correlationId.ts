import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

/**
 * Middleware de Correlation-ID (critério #9): gera (ou propaga, se o cliente
 * já enviou) um identificador único por requisição, usado em todos os logs
 * estruturados e devolvido no header de resposta para rastreamento ponta a
 * ponta.
 */
export function registerCorrelationId(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    const incoming = request.headers['x-correlation-id'];
    const correlationId =
      typeof incoming === 'string' && /^[\w.:-]{1,100}$/.test(incoming) ? incoming : randomUUID();
    request.id = correlationId;
    reply.header('x-correlation-id', correlationId);
  });
}
