import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ChatbotController } from './chatbot.controller.js';

const LEITURA_TODOS = requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE', 'PORTARIA');

/** RIGABRAS AI (Módulo 10) — assistente operacional conversacional, somente leitura. */
export async function chatbotRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.post(
    '/perguntar',
    {
      preHandler: LEITURA_TODOS,
      config: { rateLimit: { max: 15, timeWindow: '1 minute' } },
    },
    ChatbotController.perguntar,
  );
}
