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
  app.patch(
    '/:id/motorista',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    ViagensController.trocarMotorista,
  );
  app.get(
    '/:id/motorista-historico',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    ViagensController.getMotoristaHistorico,
  );
  app.get(
    '/:id/status-history',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    ViagensController.getStatusHistory,
  );
  // Módulo 6 (Integração TMS+WMS): leitura aberta a todos os papéis, mesmo padrão do status-history.
  app.get(
    '/:id/wms-status',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    ViagensController.getWmsStatus,
  );
  app.delete('/:id', { preHandler: requireRole('SUPERADMIN', 'ADMIN') }, ViagensController.remove);
}
