import type { FastifyReply, FastifyRequest } from 'fastify';
import { CreateEventoFronteiraSchema } from '@rigabras/shared';
import { FronteiraService } from './fronteira.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { Problems } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new FronteiraService();

function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    void Problems.badRequest(reply, error.detail ?? error.message).status(error.status);
    return true;
  }
  return false;
}

export const FronteiraController = {
  async listByViagem(request: FastifyRequest, reply: FastifyReply) {
    const { viagemId } = request.params as { viagemId: string };
    try {
      const eventos = await service.listByViagem(viagemId);
      return reply.send(eventos);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async registrarEtapa(request: FastifyRequest, reply: FastifyReply) {
    const { viagemId } = request.params as { viagemId: string };
    const parsed = parseOrProblem(CreateEventoFronteiraSchema, request.body, reply);
    if (!parsed) return;
    const body = { ...parsed, viagem_id: viagemId };
    try {
      const created = await service.registrarEtapa(body, request.user?.sub ?? null, request.ip);
      return reply.status(201).send(created);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async kpis(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { rota?: string; periodStart?: string; periodEnd?: string };
    const result = await service.getKpis({
      rota: query.rota,
      periodStart: query.periodStart,
      periodEnd: query.periodEnd,
    });
    return reply.send(result);
  },
};
