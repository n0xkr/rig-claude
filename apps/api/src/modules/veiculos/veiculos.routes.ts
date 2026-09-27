import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { VeiculosController } from './veiculos.controller.js';

export async function veiculosRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.get(
    '/',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    VeiculosController.list,
  );
  app.get(
    '/:id',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    VeiculosController.getById,
  );
  app.post(
    '/',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    VeiculosController.create,
  );
  app.patch(
    '/:id',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    VeiculosController.update,
  );
  app.delete('/:id', { preHandler: requireRole('SUPERADMIN', 'ADMIN') }, VeiculosController.remove);
}
