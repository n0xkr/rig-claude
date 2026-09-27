import type { FastifyReply, FastifyRequest } from 'fastify';
import { CreateDocumentoEmbarqueSchema, UpdateDocumentoEmbarqueSchema } from '@rigabras/shared';
import { DocumentosEmbarqueService } from './documentosEmbarque.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new DocumentosEmbarqueService();

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

export const DocumentosEmbarqueController = {
  async listByViagem(request: FastifyRequest, reply: FastifyReply) {
    const { viagemId } = request.params as { viagemId: string };
    const docs = await service.listByViagem(viagemId);
    return reply.send(docs);
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const { viagemId } = request.params as { viagemId: string };
    const parsed = parseOrProblem(CreateDocumentoEmbarqueSchema, request.body, reply);
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
    const body = parseOrProblem(UpdateDocumentoEmbarqueSchema, request.body, reply);
    if (!body) return;
    try {
      const updated = await service.update(id, body, request.user?.sub ?? null, request.ip);
      return reply.send(updated);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async validar(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const updated = await service.validar(id, request.user?.sub ?? null, request.ip);
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
