import type { FastifyReply, FastifyRequest } from 'fastify';
import { ValidarPreEmbarqueInputSchema } from '@rigabras/shared';
import { ValidacaoPreEmbarqueService } from './validacaoPreEmbarque.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new ValidacaoPreEmbarqueService();

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

export const ValidacaoPreEmbarqueController = {
  async validar(request: FastifyRequest, reply: FastifyReply) {
    const { viagemId } = request.params as { viagemId: string };
    const body = parseOrProblem(ValidarPreEmbarqueInputSchema, request.body ?? {}, reply);
    if (!body) return;
    try {
      const resultado = await service.validar(viagemId, body);
      return reply.send(resultado);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
};
