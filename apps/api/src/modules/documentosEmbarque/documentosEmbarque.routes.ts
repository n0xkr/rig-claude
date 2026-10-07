import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { DocumentosEmbarqueController } from './documentosEmbarque.controller.js';

/** Rotas aninhadas em /viagens/:viagemId/documentos */
export async function documentosEmbarqueNestedRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.get(
    '/:viagemId/documentos',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    DocumentosEmbarqueController.listByViagem,
  );
  app.post(
    '/:viagemId/documentos',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    DocumentosEmbarqueController.create,
  );
}

/** Rotas diretas em /documentos-embarque/:id */
export async function documentosEmbarqueDirectRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.patch(
    '/:id',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    DocumentosEmbarqueController.update,
  );
  app.patch(
    '/:id/validar',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    DocumentosEmbarqueController.validar,
  );
  app.delete(
    '/:id',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN') },
    DocumentosEmbarqueController.remove,
  );
}
