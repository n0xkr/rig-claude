import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  AddRecebimentoItemSchema,
  ConferirRecebimentoItemSchema,
  CreateRecebimentoSchema,
  UpdateRecebimentoItemSchema,
  type StatusRecebimento,
} from '@rigabras/shared';
import { RecebimentosService } from './recebimentos.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new RecebimentosService();

function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    sendProblem(reply, error.status, error.message, error.detail);
    return true;
  }
  return false;
}

export const RecebimentosController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as {
      depositanteId?: string;
      status?: StatusRecebimento;
      cursor?: string;
      limit?: string;
    };
    try {
      const result = await service.list({
        depositanteId: query.depositanteId,
        status: query.status,
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
      const recebimento = await service.getById(id);
      return reply.send(recebimento);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(CreateRecebimentoSchema, request.body, reply);
    if (!body) return;
    try {
      const created = await service.create(body, request.user?.sub ?? null, request.ip);
      return reply.status(201).send(created);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async addItem(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = parseOrProblem(AddRecebimentoItemSchema, request.body, reply);
    if (!body) return;
    try {
      const result = await service.addItem(id, body, request.user?.sub ?? null, request.ip);
      return reply.status(201).send(result);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async updateItem(request: FastifyRequest, reply: FastifyReply) {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const body = parseOrProblem(UpdateRecebimentoItemSchema, request.body, reply);
    if (!body) return;
    try {
      const result = await service.updateItem(id, itemId, body, request.user?.sub ?? null, request.ip);
      return reply.send(result);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async removeItem(request: FastifyRequest, reply: FastifyReply) {
    const { id, itemId } = request.params as { id: string; itemId: string };
    try {
      const result = await service.removeItem(id, itemId, request.user?.sub ?? null, request.ip);
      return reply.send(result);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async iniciarConferencia(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const updated = await service.iniciarConferencia(id, request.user?.sub ?? null, request.ip);
      return reply.send(updated);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async conferirItem(request: FastifyRequest, reply: FastifyReply) {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const body = parseOrProblem(ConferirRecebimentoItemSchema, request.body, reply);
    if (!body) return;
    try {
      const updated = await service.conferirItem(
        id,
        itemId,
        body,
        request.user?.sub ?? null,
        request.ip,
      );
      return reply.send(updated);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async concluirConferencia(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const updated = await service.concluirConferencia(id, request.user?.sub ?? null, request.ip);
      return reply.send(updated);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
};
