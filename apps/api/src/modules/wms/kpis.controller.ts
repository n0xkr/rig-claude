import type { FastifyReply, FastifyRequest } from 'fastify';
import { KpisService } from './kpis.service.js';
import { ProdutosRepository } from './produtos.repository.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new KpisService();
const produtosRepo = new ProdutosRepository();

function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    sendProblem(reply, error.status, error.message, error.detail);
    return true;
  }
  return false;
}

export const KpisController = {
  async getKpis(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as {
      armazemId?: string;
      periodStart?: string;
      periodEnd?: string;
    };
    try {
      const result = await service.getKpis(query);
      return reply.send(result);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async rastrearProduto(request: FastifyRequest, reply: FastifyReply) {
    const { produtoId } = request.params as { produtoId: string };
    try {
      const produto = await produtosRepo.findById(produtoId);
      if (!produto) {
        sendProblem(reply, 404, 'produto_armazenado não encontrado', `id ${produtoId}`);
        return;
      }
      const result = await service.rastrearProduto(produtoId);
      return reply.send(result);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async rastrearMovimentacao(request: FastifyRequest, reply: FastifyReply) {
    const { movimentacaoId } = request.params as { movimentacaoId: string };
    try {
      const result = await service.rastrearMovimentacao(movimentacaoId);
      return reply.send(result);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
};
