import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CreateEnderecoArmazemSchema, UpdateEnderecoArmazemSchema } from '@rigabras/shared';
import { EnderecosService } from './enderecos.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new EnderecosService();

const CreateArmazemSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  endereco: z.string().trim().max(500).nullish(),
  area_m2: z.coerce.number().positive().nullish(),
});

function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    sendProblem(reply, error.status, error.message, error.detail);
    return true;
  }
  return false;
}

export const EnderecosController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as {
      armazemId?: string;
      status?: string;
      cursor?: string;
      limit?: string;
    };
    try {
      const result = await service.list({
        armazemId: query.armazemId,
        status: query.status,
        cursor: query.cursor,
        limit: query.limit ? Number(query.limit) : 50,
      });
      return reply.send(result);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async listArmazens(_request: FastifyRequest, reply: FastifyReply) {
    const armazens = await service.listArmazens();
    return reply.send({ data: armazens });
  },

  async createArmazem(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(CreateArmazemSchema, request.body, reply);
    if (!body) return;
    const created = await service.createArmazem(body, request.user?.sub ?? null, request.ip);
    return reply.status(201).send(created);
  },

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const endereco = await service.getById(id);
      return reply.send(endereco);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(CreateEnderecoArmazemSchema, request.body, reply);
    if (!body) return;
    try {
      const created = await service.create(body, request.user?.sub ?? null, request.ip);
      return reply.status(201).send(created);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = parseOrProblem(UpdateEnderecoArmazemSchema, request.body, reply);
    if (!body) return;
    try {
      const updated = await service.update(id, body, request.user?.sub ?? null, request.ip);
      return reply.send(updated);
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
