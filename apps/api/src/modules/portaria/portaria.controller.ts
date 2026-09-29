import type { FastifyReply, FastifyRequest } from 'fastify';
import type { StatusPortariaEntrada } from '@rigabras/shared';
import {
  AtualizarStatusPortariaEntradaSchema,
  CreatePortariaDocumentoSchema,
  CreatePortariaEntradaSchema,
  CreatePortariaSaidaSchema,
  SolicitarUploadDocumentoPortariaSchema,
  StatusPortariaEntradaSchema,
} from '@rigabras/shared';
import { PortariaService } from './portaria.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new PortariaService();

/**
 * Traduz erros de domínio e violações de constraint do Postgres (PostgREST)
 * para RFC 7807 útil. Sem isto, 23505/23503/23514/22P02 viravam 500 genérico
 * no error handler global.
 */
function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    sendProblem(reply, error.status, error.message, error.detail);
    return true;
  }
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : null;
  switch (code) {
    case '23505':
      sendProblem(reply, 409, 'Conflito de estado', 'Registro duplicado (já existe um registro com estes dados)');
      return true;
    case '23503':
      sendProblem(
        reply,
        422,
        'Referência inválida',
        'Um dos registros referenciados (viagem, motorista ou entrada) não existe',
      );
      return true;
    case '23514':
      sendProblem(reply, 422, 'Entidade não processável', 'Algum valor viola uma regra de validação do banco');
      return true;
    case '23502':
      sendProblem(reply, 422, 'Entidade não processável', 'Campo obrigatório ausente');
      return true;
    case '22P02':
      sendProblem(reply, 422, 'Requisição inválida', 'Identificador ou valor em formato inválido');
      return true;
    default:
      return false;
  }
}

export const PortariaController = {
  async listEntradas(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { status?: string };
    let status: StatusPortariaEntrada | undefined;
    if (query.status) {
      const parsed = StatusPortariaEntradaSchema.safeParse(query.status);
      if (!parsed.success) {
        return sendProblem(reply, 422, 'Requisição inválida', `Status inválido: ${query.status}`);
      }
      status = parsed.data;
    }
    try {
      const entradas = await service.listEntradas({ status });
      return reply.send(entradas);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
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

  async solicitarUploadDocumento(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = parseOrProblem(SolicitarUploadDocumentoPortariaSchema, request.body, reply);
    if (!body) return;
    try {
      const upload = await service.gerarUrlUploadDocumento(id, body.nome_arquivo);
      return reply.send(upload);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async urlDocumento(request: FastifyRequest, reply: FastifyReply) {
    const { id, documentoId } = request.params as { id: string; documentoId: string };
    try {
      const download = await service.obterUrlDocumento(id, documentoId);
      return reply.send(download);
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
    try {
      const kpis = await service.getKpis();
      return reply.send(kpis);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
};
