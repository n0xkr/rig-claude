import type { FastifyReply, FastifyRequest } from 'fastify';
import { UpdatePerfilSchema } from '@rigabras/shared';
import { PerfilService } from './perfil.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { DomainError } from '../../lib/errors.js';

const service = new PerfilService();

async function run<T>(reply: FastifyReply, fn: () => Promise<T>) {
  try {
    return reply.send(await fn());
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

export const PerfilController = {
  async obter(request: FastifyRequest, reply: FastifyReply) {
    return run(reply, () => service.obter(request.user!.sub));
  },

  async atualizar(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(UpdatePerfilSchema, request.body, reply);
    if (!body) return;
    return run(reply, () => service.atualizar(request.user!.sub, body, request.ip));
  },
};
