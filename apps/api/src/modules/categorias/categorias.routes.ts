import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CreateCategoriaUsuarioSchema, UpdateCategoriaUsuarioSchema } from '@rigabras/shared';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';
import { CategoriasService } from './categorias.service.js';

const service = new CategoriasService();
const ParamsSchema = z.object({ id: z.string().uuid() });

async function run<T>(reply: FastifyReply, fn: () => Promise<T>, status = 200) {
  try {
    const result = await fn();
    return status === 204 ? reply.status(204).send() : reply.status(status).send(result);
  } catch (error) {
    if (error instanceof DomainError) {
      sendProblem(reply, error.status, error.message, error.detail);
      return;
    }
    throw error;
  }
}

/** Categorias de usuário (grupos de permissões por módulo) — exclusivo de SUPERADMIN. */
export async function categoriasRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.addHook('preHandler', requireRole('SUPERADMIN'));

  app.get('/', async (_request: FastifyRequest, reply: FastifyReply) =>
    run(reply, async () => ({ data: await service.list() })),
  );

  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseOrProblem(CreateCategoriaUsuarioSchema, request.body, reply);
    if (!body) return;
    return run(reply, () => service.create(body, request.user!.sub, request.ip), 201);
  });

  app.patch('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = parseOrProblem(ParamsSchema, request.params, reply);
    const body = params && parseOrProblem(UpdateCategoriaUsuarioSchema, request.body, reply);
    if (!params || !body) return;
    return run(reply, () => service.update(params.id, body, request.user!.sub, request.ip));
  });

  app.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = parseOrProblem(ParamsSchema, request.params, reply);
    if (!params) return;
    return run(reply, () => service.remove(params.id, request.user!.sub, request.ip), 204);
  });
}
