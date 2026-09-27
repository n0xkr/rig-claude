import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ViagensController } from './viagens.controller.js';

export async function viagensRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);

  app.get(
    '/',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    ViagensController.list,
  );
  app.get(
    '/:id',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    ViagensController.getById,
  );
  app.post(
    '/',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    ViagensController.create,
  );
  app.patch(
    '/:id',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    ViagensController.update,
  );
  app.patch(
    '/:id/status',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    ViagensController.changeStatus,
  );
  app.get(
    '/:id/status-history',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    ViagensController.getStatusHistory,
  );
  app.delete('/:id', { preHandler: requireRole('SUPERADMIN', 'ADMIN') }, ViagensController.remove);
}
