import type { FastifyReply, FastifyRequest } from 'fastify';
import { CreateVeiculoSchema, UpdateVeiculoSchema } from '@rigabras/shared';
import { VeiculosService } from './veiculos.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new VeiculosService();

/**
 * Envia o status real do erro de domínio (404/409/422/...) via `sendProblem`,
 * em vez do padrão antigo `Problems.badRequest(reply, ...).status(error.status)`,
 * que sempre respondia 400 pois `.status()` não tem efeito depois de `.send()`
 * já ter sido chamado (bug corrigido a partir do padrão do Módulo 3).
 */
function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    sendProblem(reply, error.status, error.message, error.detail);
    return true;
  }
  return false;
}

export const VeiculosController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { cursor?: string; limit?: string };
    const limite = Math.min(Math.max(Number(query.limit) || 20, 1), 1000);
    const result = await service.list(limite, query.cursor);
    return reply.send(result);
  },
  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await service.getById(id));
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(CreateVeiculoSchema, request.body, reply);
    if (!body) return;
    try {
      return reply
        .status(201)
        .send(await service.create(body, request.user?.sub ?? null, request.ip));
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = parseOrProblem(UpdateVeiculoSchema, request.body, reply);
    if (!body) return;
    try {
      return reply.send(await service.update(id, body, request.user?.sub ?? null, request.ip));
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
  async remove(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      await service.softDelete(id, request.user?.sub ?? null, request.ip);
      return reply.status(204).send();
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
};
