import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  MovimentacaoManualEstoqueSchema,
  TipoMovimentacaoEstoqueSchema,
  type TipoMovimentacaoEstoque,
} from '@rigabras/shared';
import { z } from 'zod';
import { EstoqueService } from './estoque.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new EstoqueService();

const ListSaldosQuery = z.object({
  armazemId: z.string().uuid().optional(),
  produtoId: z.string().uuid().optional(),
  q: z.string().max(200).optional(),
});

const ListMovimentacoesQuery = z.object({
  produtoId: z.string().uuid().optional(),
  tipo: TipoMovimentacaoEstoqueSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    sendProblem(reply, error.status, error.message, error.detail);
    return true;
  }
  return false;
}

export const EstoqueController = {
  async listSaldos(request: FastifyRequest, reply: FastifyReply) {
    const query = parseOrProblem(ListSaldosQuery, request.query, reply);
    if (!query) return;
    try {
      const data = await service.listSaldos(query);
      return reply.send({ data });
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async movimentarManual(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(MovimentacaoManualEstoqueSchema, request.body, reply);
    if (!body) return;
    try {
      const movimentacao = await service.movimentarManual(
        body,
        request.user?.sub ?? null,
        request.ip,
      );
      return reply.status(201).send(movimentacao);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async listMovimentacoes(request: FastifyRequest, reply: FastifyReply) {
    const query = parseOrProblem(ListMovimentacoesQuery, request.query, reply);
    if (!query) return;
    try {
      const data = await service.listMovimentacoes({
        produtoId: query.produtoId,
        tipo: query.tipo as TipoMovimentacaoEstoque | undefined,
        limit: query.limit,
      });
      return reply.send({ data });
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
};
