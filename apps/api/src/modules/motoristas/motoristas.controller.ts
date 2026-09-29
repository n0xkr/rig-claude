import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateMotoristaSchema,
  EnviarDocumentosMotoristaSchema,
  OcrDocumentoInputSchema,
  UpdateMotoristaSchema,
} from '@rigabras/shared';
import {
  enviarDocumentos,
  excluirDocumento,
  lerDocumentoPorOcr,
  listarDocumentos,
} from './motoristas.documentos.js';
import { MotoristasService } from './motoristas.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new MotoristasService();

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

export const MotoristasController = {
  async ocr(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(OcrDocumentoInputSchema, request.body, reply);
    if (!body) return;
    try {
      return reply.send(await lerDocumentoPorOcr(body));
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
  async listarDocumentos(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      await service.getById(id);
      return reply.send(await listarDocumentos(id));
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
  async enviarDocumentos(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = parseOrProblem(EnviarDocumentosMotoristaSchema, request.body, reply);
    if (!body) return;
    try {
      await service.getById(id);
      const docs = await enviarDocumentos(id, body, request.user?.sub ?? null, request.ip);
      return reply.status(201).send(docs);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
  async excluirDocumento(request: FastifyRequest, reply: FastifyReply) {
    const { id, docId } = request.params as { id: string; docId: string };
    try {
      await excluirDocumento(id, docId, request.user?.sub ?? null, request.ip);
      return reply.status(204).send();
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { cursor?: string; limit?: string };
    return reply.send(
      await service.list(Math.min(Math.max(Number(query.limit) || 20, 1), 1000), query.cursor),
    );
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
    const body = parseOrProblem(CreateMotoristaSchema, request.body, reply);
    if (!body) return;
    try {
      return reply
        .status(201)
        .send(await service.create(body, request.user?.sub ?? null, request.ip));
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = parseOrProblem(UpdateMotoristaSchema, request.body, reply);
    if (!body) return;
    try {
      return reply.send(await service.update(id, body, request.user?.sub ?? null, request.ip));
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
