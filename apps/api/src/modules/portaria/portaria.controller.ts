import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  AtualizarStatusPortariaEntradaSchema,
  CreatePortariaDocumentoSchema,
  CreatePortariaEntradaSchema,
  CreatePortariaSaidaSchema,
} from '@rigabras/shared';
import { PortariaService } from './portaria.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new PortariaService();

function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    sendProblem(reply, error.status, error.message, error.detail);
    return true;
  }
  return false;
}

export const PortariaController = {
  async listEntradas(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { status?: string };
    const entradas = await service.listEntradas({ status: query.status as never });
    return reply.send(entradas);
  },

  async getEntrada(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const detalhe = await service.getEntradaDetalhe(id);
      return reply.send(detalhe);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async registrarEntrada(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(CreatePortariaEntradaSchema, request.body, reply);
    if (!body) return;
    try {
      const result = await service.registrarEntrada(body, request.user?.sub ?? null, request.ip);
      return reply.status(201).send(result);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async atualizarStatus(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = parseOrProblem(AtualizarStatusPortariaEntradaSchema, request.body, reply);
    if (!body) return;
    try {
      const atualizado = await service.atualizarStatusEntrada(
        id,
        body.status,
        body.observacoes,
        request.user?.sub ?? null,
        request.ip,
      );
      return reply.send(atualizado);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async anexarDocumento(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = parseOrProblem(CreatePortariaDocumentoSchema, request.body, reply);
    if (!body) return;
    try {
      const documento = await service.anexarDocumento(
        id,
        body,
        request.user?.sub ?? null,
        request.ip,
      );
      return reply.status(201).send(documento);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async registrarSaida(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = parseOrProblem(CreatePortariaSaidaSchema, request.body, reply);
    if (!body) return;
    try {
      const result = await service.registrarSaida(id, body, request.user?.sub ?? null, request.ip);
      return reply.status(201).send(result);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async kpis(_request: FastifyRequest, reply: FastifyReply) {
    const kpis = await service.getKpis();
    return reply.send(kpis);
  },
};
