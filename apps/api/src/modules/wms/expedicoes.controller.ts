import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateExpedicaoSchema,
  SepararExpedicaoItemSchema,
  VincularViagemExpedicaoSchema,
  type StatusExpedicao,
} from '@rigabras/shared';
import { z } from 'zod';
import { ExpedicoesService } from './expedicoes.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new ExpedicoesService();

const FlagsSchema = z.object({
  reembalado: z.boolean().optional(),
  etiquetado: z.boolean().optional(),
});

function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    sendProblem(reply, error.status, error.message, error.detail);
    return true;
  }
  return false;
}

export const ExpedicoesController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as {
      depositanteId?: string;
      status?: StatusExpedicao;
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
      const expedicao = await service.getById(id);
      return reply.send(expedicao);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(CreateExpedicaoSchema, request.body, reply);
    if (!body) return;
    try {
      const created = await service.create(body, request.user?.sub ?? null, request.ip);
      return reply.status(201).send(created);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async iniciarSeparacao(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const updated = await service.iniciarSeparacao(id, request.user?.sub ?? null, request.ip);
      return reply.send(updated);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async separarItem(request: FastifyRequest, reply: FastifyReply) {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const body = parseOrProblem(SepararExpedicaoItemSchema, request.body, reply);
    if (!body) return;
    try {
      const updated = await service.separarItem(
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

  async marcarReembalagemEtiquetagem(request: FastifyRequest, reply: FastifyReply) {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const body = parseOrProblem(FlagsSchema, request.body, reply);
    if (!body) return;
    try {
      const updated = await service.marcarReembalagemEtiquetagem(
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

  async concluirSeparacao(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const updated = await service.concluirSeparacao(id, request.user?.sub ?? null, request.ip);
      return reply.send(updated);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  /** Módulo 6 (Integração TMS+WMS): vincula a expedição a uma viagem do TMS. */
  async vincularViagem(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = parseOrProblem(VincularViagemExpedicaoSchema, request.body, reply);
    if (!body) return;
    try {
      const updated = await service.vincularViagem(
        id,
        body.viagem_id,
        request.user?.sub ?? null,
        request.ip,
      );
      return reply.send(updated);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async marcarProntaExpedicao(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const updated = await service.marcarProntaExpedicao(
        id,
        request.user?.sub ?? null,
        request.ip,
      );
      return reply.send(updated);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async expedir(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const updated = await service.expedir(id, request.user?.sub ?? null, request.ip);
      return reply.send(updated);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async cancelar(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const updated = await service.cancelar(id, request.user?.sub ?? null, request.ip);
      return reply.send(updated);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
};
