import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuditoriaService } from './auditoria.service.js';

const service = new AuditoriaService();

export const AuditoriaController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as {
      entity?: string;
      entityId?: string;
      userId?: string;
      cursor?: string;
      limit?: string;
    };
    const resultado = await service.list({
      entity: query.entity,
      entityId: query.entityId,
      userId: query.userId,
      cursor: query.cursor,
      limit: query.limit ? Number(query.limit) : 50,
    });
    return reply.send(resultado);
  },
};
