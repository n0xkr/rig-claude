import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { JornadaController } from './jornada.controller.js';

/**
 * Rotas de Controle de Jornada (Módulo 4, parte B — foco ADI 5322). RBAC:
 * OPERADOR pode registrar eventos em tempo real (mesmo padrão operacional de
 * `eventos_risco`/`viagens`), mas o log é INSERT-ONLY para esse papel — não
 * há rota de edição, e a exclusão (correção de lançamento indevido) fica
 * restrita a SUPERADMIN, preservando a integridade probatória do histórico
 * (ver migration 0005). Leitura (histórico, alertas) aberta a todos os
 * papéis autenticados, incluindo VISITANTE — painel de compliance, sem dado
 * financeiro sensível.
 */
export async function jornadaRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);

  app.post(
    '/eventos',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    JornadaController.registrarEvento,
  );
  app.delete(
    '/eventos/:id',
    { preHandler: requireRole('SUPERADMIN') },
    JornadaController.removeEvento,
  );

  app.get(
    '/motoristas/:motoristaId/eventos',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    JornadaController.listEventosByMotorista,
  );
  app.get(
    '/motoristas/:motoristaId/historico',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    JornadaController.getHistorico,
  );

  app.get(
    '/alertas',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    JornadaController.getAlertas,
  );
}
