import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ValidacaoPreEmbarqueController } from './validacaoPreEmbarque.controller.js';

/** Rota aninhada em /viagens/:viagemId/validacao-pre-embarque */
export async function validacaoPreEmbarqueRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.post(
    '/:viagemId/validacao-pre-embarque',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    ValidacaoPreEmbarqueController.validar,
  );
}
