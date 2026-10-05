import type { FastifyReply, FastifyRequest } from 'fastify';
import { CreateRedeSchema, CreateRedeMovimentacaoSchema, UpdateRedeSchema } from '@rigabras/shared';
import { RedesService } from './redes.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new RedesService();

function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    sendProblem(reply, error.status, error.message, error.detail);
    return true;
  }
  return false;
}

export const RedesController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as {
      status?: string;
      condicao?: string;
      q?: string;
      cursor?: string;
      limit?: string;
    };
    const limit = Math.min(Math.max(Math.trunc(Number(query.limit)) || 50, 1), 200);
    try {
      const result = await service.list({
        status: query.status,
        condicao: query.condicao,
        q: query.q,
        cursor: query.cursor,
        limit,
      });
      return reply.send(result);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async kpis(_request: FastifyRequest, reply: FastifyReply) {
    try {
      return reply.send(await service.kpis());
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async listMovimentacoes(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { redeId?: string; limit?: string };
    const limit = Math.min(Math.max(Math.trunc(Number(query.limit)) || 50, 1), 200);
    try {
      const data = await service.listMovimentacoes({ redeId: query.redeId, limit });
      return reply.send({ data });
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
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
    const body = parseOrProblem(CreateRedeSchema, request.body, reply);
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
    const body = parseOrProblem(UpdateRedeSchema, request.body, reply);
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

  async movimentar(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = parseOrProblem(CreateRedeMovimentacaoSchema, request.body, reply);
    if (!body) return;
    try {
      const resultado = await service.movimentar(
        id,
        { ...body, rede_id: id },
        request.user?.sub ?? null,
        request.ip,
      );
      return reply.status(201).send(resultado);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
};
