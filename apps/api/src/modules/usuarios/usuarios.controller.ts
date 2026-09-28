import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { UserRoleSchema } from '@rigabras/shared';
import { UsuariosService } from './usuarios.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { DomainError } from '../../lib/errors.js';

const service = new UsuariosService();

const CreateSchema = z.object({
  nome_completo: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
  role: UserRoleSchema,
  ativo: z.boolean().optional(),
});

const PatchSchema = z
  .object({
    nome_completo: z.string().trim().min(2).max(120),
    role: UserRoleSchema,
    ativo: z.boolean(),
    password: z.string().min(8).max(72),
  })
  .partial();

const ParamsSchema = z.object({ id: z.string().uuid() });

async function run<T>(reply: FastifyReply, fn: () => Promise<T>, status = 200) {
  try {
    const result = await fn();
    return status === 204 ? reply.status(204).send() : reply.status(status).send(result);
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

export const UsuariosController = {
  async list(_request: FastifyRequest, reply: FastifyReply) {
    return run(reply, async () => ({ data: await service.list() }));
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(CreateSchema, request.body, reply);
    if (!body) return;
    return run(reply, () => service.create(body, request.user!.sub, request.ip), 201);
  },

  async update(request: FastifyRequest, reply: FastifyReply) {
    const params = parseOrProblem(ParamsSchema, request.params, reply);
    const body = params && parseOrProblem(PatchSchema, request.body, reply);
    if (!params || !body) return;
    return run(reply, () => service.update(params.id, body, request.user!.sub, request.ip));
  },

  async remove(request: FastifyRequest, reply: FastifyReply) {
    const params = parseOrProblem(ParamsSchema, request.params, reply);
    if (!params) return;
    return run(reply, () => service.remove(params.id, request.user!.sub, request.ip), 204);
  },
};
