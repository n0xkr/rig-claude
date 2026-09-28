import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { AuditoriaController } from './auditoria.controller.js';

/** Trilha de auditoria (critério #21) — leitura restrita a ADMIN/SUPERADMIN, mesmo RLS já aplicado em `audit_logs` desde a migration 0002. */
export async function auditoriaRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.get('/', { preHandler: requireRole('SUPERADMIN', 'ADMIN') }, AuditoriaController.list);
}
