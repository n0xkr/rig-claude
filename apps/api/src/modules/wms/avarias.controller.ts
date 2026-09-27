import type { FastifyReply, FastifyRequest } from 'fastify';
import { CreateAvariaSchema } from '@rigabras/shared';
import { AvariasService } from './avarias.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new AvariasService();

function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    sendProblem(reply, error.status, error.message, error.detail);
    return true;
  }
  return false;
}

export const AvariasController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as {
      produtoId?: string;
      severidade?: string;
      cursor?: string;
      limit?: string;
    };
    try {
      const result = await service.list({
        produtoId: query.produtoId,
        severidade: query.severidade,
        cursor: query.cursor,
        limit: query.limit ? Number(query.limit) : 20,
      });
      return reply.send(result);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const avaria = await service.getById(id);
      return reply.send(avaria);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(CreateAvariaSchema, request.body, reply);
    if (!body) return;
    try {
      const created = await service.create(body, request.user?.sub ?? null, request.ip);
      return reply.status(201).send(created);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
};
