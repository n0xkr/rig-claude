import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  ChangeStatusFreteSchema,
  CreateFreteLancamentoSchema,
  CreateFreteNestedSchema,
  CreateFreteSchema,
  CreatePagamentoFreteSchema,
  UpdateFreteSchema,
} from '@rigabras/shared';
import { FretesService } from './fretes.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new FretesService();

/**
 * Diferente do helper homônimo usado nos controllers dos Módulos 1/2 (que
 * sempre envia `400` via `Problems.badRequest` e tenta sobrescrever o status
 * depois do `send()` — o que não tem efeito no Fastify, pois o status já foi
 * serializado), aqui usamos `sendProblem` diretamente com `error.status`,
 * para que 404/409/422/403 sejam realmente retornados como tal (essencial
 * para o RBAC granular por transição do critério #4 deste módulo).
 */
function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    sendProblem(reply, error.status, error.message, error.detail);
    return true;
  }
  return false;
}

export const FretesController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as {
      status?: string;
      viagemId?: string;
      cursor?: string;
      limit?: string;
    };
    const limit = query.limit ? Number(query.limit) : 20;
    try {
      const result = await service.list({
        status: query.status,
        viagemId: query.viagemId,
        cursor: query.cursor,
        limit,
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
      const frete = await service.getById(id);
      return reply.send(frete);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async getByViagem(request: FastifyRequest, reply: FastifyReply) {
    const { viagemId } = request.params as { viagemId: string };
    try {
      const frete = await service.getByViagemId(viagemId);
      return reply.send(frete);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(CreateFreteSchema, request.body, reply);
    if (!body) return;
    try {
      const created = await service.create(body, request.user?.sub ?? null, request.ip);
      return reply.status(201).send(created);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async createNested(request: FastifyRequest, reply: FastifyReply) {
    const { viagemId } = request.params as { viagemId: string };
    const parsed = parseOrProblem(CreateFreteNestedSchema, request.body, reply);
    if (!parsed) return;
    const body = { ...parsed, viagem_id: viagemId };
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
    const body = parseOrProblem(UpdateFreteSchema, request.body, reply);
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
    const body = parseOrProblem(ChangeStatusFreteSchema, request.body, reply);
    if (!body) return;
    try {
      const updated = await service.changeStatus(
        id,
        body.status,
        request.user?.sub ?? null,
        request.user?.role ?? 'VISITANTE',
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

  async getSaldo(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const saldo = await service.computeSaldo(id);
      return reply.send(saldo);
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

  async listLancamentos(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const lancamentos = await service.listLancamentos(id);
      return reply.send(lancamentos);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async createLancamento(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = parseOrProblem(CreateFreteLancamentoSchema, request.body, reply);
    if (!body) return;
    try {
      const created = await service.createLancamento(
        id,
        body,
        request.user?.sub ?? null,
        request.ip,
      );
      return reply.status(201).send(created);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async removeLancamento(request: FastifyRequest, reply: FastifyReply) {
    const { id, lancamentoId } = request.params as { id: string; lancamentoId: string };
    try {
      await service.softDeleteLancamento(id, lancamentoId, request.user?.sub ?? null, request.ip);
      return reply.status(204).send();
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async listPagamentos(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const pagamentos = await service.listPagamentos(id);
      return reply.send(pagamentos);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async createPagamento(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = parseOrProblem(CreatePagamentoFreteSchema, request.body, reply);
    if (!body) return;
    try {
      const created = await service.createPagamento(
        id,
        body,
        request.user?.sub ?? null,
        request.ip,
      );
      return reply.status(201).send(created);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
};
