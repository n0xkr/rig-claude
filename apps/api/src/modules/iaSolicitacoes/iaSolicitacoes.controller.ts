import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AnalisarAbaInputSchema,
  CriarLoteInputSchema,
  DecidirLoteInputSchema,
  ListarSolicitacoesQuerySchema,
  RecusarSolicitacaoInputSchema,
  ResponderSolicitacaoInputSchema,
} from '@rigabras/shared';
import { IaSolicitacoesService } from './iaSolicitacoes.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { DomainError } from '../../lib/errors.js';

const service = new IaSolicitacoesService();
const IdParams = z.object({ id: z.string().uuid() });

async function run<T>(reply: FastifyReply, fn: () => Promise<T>, status = 200) {
  try {
    return reply.status(status).send(await fn());
  } catch (error) {
    if (error instanceof DomainError) {
      return reply.status(error.status).type('application/problem+json').send({
        type: 'about:blank',
        title: error.message,
        status: error.status,
        detail: error.detail,
        instance: reply.request.url,
      });
    }
    throw error;
  }
}

export const IaSolicitacoesController = {
  // ----- fila de solicitações (ADMIN/SUPERADMIN) -----------------------------
  async listar(request: FastifyRequest, reply: FastifyReply) {
    const query = parseOrProblem(ListarSolicitacoesQuerySchema, request.query, reply);
    if (!query) return;
    return run(reply, () => service.listar(query));
  },

  async resumo(_request: FastifyRequest, reply: FastifyReply) {
    return run(reply, () => service.resumo());
  },

  async aprovar(request: FastifyRequest, reply: FastifyReply) {
    const params = parseOrProblem(IdParams, request.params, reply);
    if (!params) return;
    return run(reply, () => service.aprovar(params.id, request.user!.sub, request.ip));
  },

  async recusar(request: FastifyRequest, reply: FastifyReply) {
    const params = parseOrProblem(IdParams, request.params, reply);
    const body = params && parseOrProblem(RecusarSolicitacaoInputSchema, request.body ?? {}, reply);
    if (!params || !body) return;
    return run(reply, () => service.recusar(params.id, body.motivo, request.user!.sub, request.ip));
  },

  async responder(request: FastifyRequest, reply: FastifyReply) {
    const params = parseOrProblem(IdParams, request.params, reply);
    const body = params && parseOrProblem(ResponderSolicitacaoInputSchema, request.body, reply);
    if (!params || !body) return;
    return run(reply, () => service.responder(params.id, body, request.user!.sub, request.ip));
  },

  async aprovarLote(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(DecidirLoteInputSchema, request.body, reply);
    if (!body) return;
    return run(reply, async () => ({ resultados: await service.aprovarLote(body.ids, request.user!.sub, request.ip) }));
  },

  // ----- lote de importação (planilha inteira, uma aba por chamada) -----------
  async criarLote(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(CriarLoteInputSchema, request.body, reply);
    if (!body) return;
    return run(reply, () => service.criarLote(body.nome, body.origem, request.user!.sub, request.ip), 201);
  },

  async analisarAba(request: FastifyRequest, reply: FastifyReply) {
    const params = parseOrProblem(IdParams, request.params, reply);
    const body = params && parseOrProblem(AnalisarAbaInputSchema, request.body, reply);
    if (!params || !body) return;
    return run(reply, () => service.analisarAba(params.id, body));
  },

  async concluirLote(request: FastifyRequest, reply: FastifyReply) {
    const params = parseOrProblem(IdParams, request.params, reply);
    if (!params) return;
    return run(reply, () => service.concluirLote(params.id));
  },
};
