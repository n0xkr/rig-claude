import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  AtualizarQuilometragemViagemSchema,
  CreateManutencaoVeiculoSchema,
  UpdateManutencaoVeiculoSchema,
} from '@rigabras/shared';
import { FrotaService } from './frota.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new FrotaService();

/** Usa `sendProblem(reply, error.status, ...)` desde a criação deste módulo — nunca o padrão antigo `Problems.badRequest(reply, ...).status(error.status)` (bug corrigido nos Módulos 1/2, ver `docs/NOTES.md`). */
function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    sendProblem(reply, error.status, error.message, error.detail);
    return true;
  }
  return false;
}

export const FrotaController = {
  async getKpis(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as {
      veiculoId?: string;
      periodStart?: string;
      periodEnd?: string;
    };
    try {
      const result = await service.getKpis({
        veiculoId: query.veiculoId,
        periodStart: query.periodStart,
        periodEnd: query.periodEnd,
      });
      return reply.send(result);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async atualizarQuilometragem(request: FastifyRequest, reply: FastifyReply) {
    const { viagemId } = request.params as { viagemId: string };
    const body = parseOrProblem(AtualizarQuilometragemViagemSchema, request.body, reply);
    if (!body) return;
    try {
      const updated = await service.atualizarQuilometragem(
        viagemId,
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

  async listManutencoes(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { veiculoId?: string; cursor?: string; limit?: string };
    const limit = query.limit ? Number(query.limit) : 20;
    try {
      const result = await service.listManutencoes({
        veiculoId: query.veiculoId,
        cursor: query.cursor,
        limit,
      });
      return reply.send(result);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async getManutencaoById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const manutencao = await service.getManutencaoById(id);
      return reply.send(manutencao);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async createManutencao(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(CreateManutencaoVeiculoSchema, request.body, reply);
    if (!body) return;
    try {
      const created = await service.createManutencao(body, request.user?.sub ?? null, request.ip);
      return reply.status(201).send(created);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async updateManutencao(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = parseOrProblem(UpdateManutencaoVeiculoSchema, request.body, reply);
    if (!body) return;
    try {
      const updated = await service.updateManutencao(
        id,
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

  async removeManutencao(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      await service.softDeleteManutencao(id, request.user?.sub ?? null, request.ip);
      return reply.status(204).send();
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
};
