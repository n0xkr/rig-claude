import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { EscopoInsightSchema } from '@rigabras/shared';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { AcompanhamentoService } from './acompanhamento.service.js';

const service = new AcompanhamentoService();
const LEITURA = requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE');
const InsightsBody = z.object({ escopo: EscopoInsightSchema.default('geral') });

/**
 * Acompanhamento de veículos. Criar/editar/excluir usam as rotas de `/veiculos`
 * (mesmas regras e auditoria); aqui ficam a visão consolidada, o resumo para os
 * gráficos e os insights por IA.
 */
export async function acompanhamentoRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);

  app.get('/veiculos', { preHandler: LEITURA }, async (_req: FastifyRequest, reply: FastifyReply) =>
    reply.send({ data: await service.listar() }),
  );
  app.get('/resumo', { preHandler: LEITURA }, async (_req: FastifyRequest, reply: FastifyReply) =>
    reply.send(await service.resumo()),
  );
  app.post(
    '/insights',
    { preHandler: LEITURA, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = parseOrProblem(InsightsBody, request.body ?? {}, reply);
      if (!body) return;
      return reply.send(await service.insights(body.escopo));
    },
  );
}
