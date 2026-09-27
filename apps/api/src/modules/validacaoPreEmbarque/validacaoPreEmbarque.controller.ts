import type { FastifyReply, FastifyRequest } from 'fastify';
import { ValidarPreEmbarqueInputSchema } from '@rigabras/shared';
import { ValidacaoPreEmbarqueService } from './validacaoPreEmbarque.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { Problems } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';

const service = new ValidacaoPreEmbarqueService();

function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    void Problems.badRequest(reply, error.detail ?? error.message).status(error.status);
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
