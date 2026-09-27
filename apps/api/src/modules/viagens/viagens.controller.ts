import type { FastifyReply, FastifyRequest } from "fastify";
import {
  ChangeStatusViagemSchema,
  CreateViagemSchema,
  UpdateViagemSchema,
} from "@rigabras/shared";
import { ViagensService } from "./viagens.service.js";
import { parseOrProblem } from "../../middleware/validate.js";
import { Problems } from "../../lib/problemDetails.js";
import { DomainError } from "../../lib/errors.js";

const service = new ViagensService();

function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    void Problems.badRequest(reply, error.detail ?? error.message).status(error.status);
    return true;
  }
  return false;
}

export const ViagensController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { status?: string; cursor?: string; limit?: string };
    const limit = query.limit ? Number(query.limit) : 20;
    const result = await service.list({ status: query.status, cursor: query.cursor, limit });
    return reply.send(result);
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
      const updated = await service.changeStatus(id, body.status, request.user?.sub ?? null, request.ip);
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
