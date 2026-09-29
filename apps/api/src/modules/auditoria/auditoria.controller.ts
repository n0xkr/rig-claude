import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AuditoriaService } from './auditoria.service.js';
import { parseOrProblem } from '../../middleware/validate.js';

const service = new AuditoriaService();

// entity_id/user_id/id são uuid no banco: um valor inválido causaria erro 22P02 (500) na query.
const QuerySchema = z.object({
  entity: z.string().trim().min(1).max(100).optional(),
  entityId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const AuditoriaController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = parseOrProblem(QuerySchema, request.query, reply);
    if (!query) return;
    const resultado = await service.list(query);
    return reply.send(resultado);
  },
};
