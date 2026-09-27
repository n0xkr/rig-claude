import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ApolicesController } from './apolices.controller.js';

/** apolices_seguro = dado financeiro/seguros: OPERADOR não tem acesso (só SUPERADMIN/ADMIN/VISITANTE-leitura). */
export async function apolicesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.get(
    '/',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'VISITANTE') },
    ApolicesController.list,
  );
  app.get(
    '/:id',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'VISITANTE') },
    ApolicesController.getById,
  );
  app.post('/', { preHandler: requireRole('SUPERADMIN', 'ADMIN') }, ApolicesController.create);
  app.patch('/:id', { preHandler: requireRole('SUPERADMIN', 'ADMIN') }, ApolicesController.update);
  app.delete('/:id', { preHandler: requireRole('SUPERADMIN') }, ApolicesController.remove);
}
