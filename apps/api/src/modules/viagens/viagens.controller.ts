import type { FastifyReply, FastifyRequest } from 'fastify';
import { ChangeStatusViagemSchema, CreateViagemSchema, UpdateViagemSchema } from '@rigabras/shared';
import { ViagensService } from './viagens.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new ViagensService();

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

export const ViagensController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { status?: string; cursor?: string; limit?: string };
    const limit = query.limit ? Number(query.limit) : 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      return sendProblem(reply, 422, 'Parâmetro inválido', 'limit deve ser um inteiro entre 1 e 200');
    }
    try {
      // `status` inválido (fora do enum do banco) vira DomainError 422 no repository.
      const result = await service.list({ status: query.status, cursor: query.cursor, limit });
      return reply.send(result);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const viagem = await service.getById(id);
      return reply.send(viagem);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(CreateViagemSchema, request.body, reply);
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
    const body = parseOrProblem(UpdateViagemSchema, request.body, reply);
    if (!body) return;
    try {
      const updated = await service.update(id, body, request.user?.sub ?? null, request.ip);
      return reply.send(updated);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async changeStatus(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = parseOrProblem(ChangeStatusViagemSchema, request.body, reply);
    if (!body) return;
    try {
      const updated = await service.changeStatus(
        id,
        body.status,
        request.user?.sub ?? null,
        request.ip,
        body.observacoes,
      );
      return reply.send(updated);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async getStatusHistory(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const history = await service.getStatusHistory(id);
      return reply.send(history);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  /** Módulo 6 (Integração TMS+WMS): expedição/recebimento do armazém vinculados a esta viagem. */
  async getWmsStatus(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const status = await service.getWmsStatus(id);
      return reply.send(status);
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
