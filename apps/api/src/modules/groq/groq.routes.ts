import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { GroqController } from './groq.controller.js';

export async function groqRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.post(
    '/:id/analise-risco',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    GroqController.analyzeViagem,
  );
}
