import type { FastifyReply, FastifyRequest } from 'fastify';
import { ContarInventarioItemSchema, CreateInventarioSchema } from '@rigabras/shared';
import { InventariosService } from './inventarios.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new InventariosService();

function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    sendProblem(reply, error.status, error.message, error.detail);
    return true;
  }
  return false;
}

export const InventariosController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { armazemId?: string; cursor?: string; limit?: string };
    try {
      const result = await service.list({
        armazemId: query.armazemId,
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
      const inventario = await service.getById(id);
      return reply.send(inventario);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(CreateInventarioSchema, request.body, reply);
    if (!body) return;
    try {
      const created = await service.create(body, request.user?.sub ?? null, request.ip);
      return reply.status(201).send(created);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async iniciarContagem(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const updated = await service.iniciarContagem(id, request.user?.sub ?? null, request.ip);
      return reply.send(updated);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async contarItem(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = parseOrProblem(ContarInventarioItemSchema, request.body, reply);
    if (!body) return;
    try {
      const updated = await service.contarItem(id, body, request.user?.sub ?? null, request.ip);
      return reply.send(updated);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async reconciliar(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const updated = await service.reconciliar(id, request.user?.sub ?? null, request.ip);
      return reply.send(updated);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async encerrar(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const updated = await service.encerrar(id, request.user?.sub ?? null, request.ip);
      return reply.send(updated);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
};
