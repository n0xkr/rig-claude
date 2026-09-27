import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { FronteiraController } from './fronteira.controller.js';

/** Rotas aninhadas em /viagens/:viagemId/fronteira/eventos */
export async function fronteiraNestedRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.get(
    '/:viagemId/fronteira/eventos',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    FronteiraController.listByViagem,
  );
  app.post(
    '/:viagemId/fronteira/eventos',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    FronteiraController.registrarEtapa,
  );
}

/** Rotas diretas em /fronteira/kpis */
export async function fronteiraDirectRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.get(
    '/kpis',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    FronteiraController.kpis,
  );
}
