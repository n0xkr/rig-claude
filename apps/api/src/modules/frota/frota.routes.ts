import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { FrotaController } from './frota.controller.js';

/**
 * Rotas de Controle de Frota (Módulo 4, parte A): KPIs agregados,
 * quilometragem/consumo por viagem e CRUD de manutenções. RBAC: leitura
 * aberta a todos os papéis (inclusive VISITANTE — painel de indicadores,
 * sem dado financeiro sensível); escrita (manutenções, quilometragem) segue
 * o mesmo padrão operacional de `veiculos` (SUPERADMIN/ADMIN/OPERADOR);
 * exclusão de manutenções restrita a SUPERADMIN/ADMIN.
 */
export async function frotaRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);

  app.get(
    '/kpis',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    FrotaController.getKpis,
  );

  app.patch(
    '/viagens/:viagemId/quilometragem',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    FrotaController.atualizarQuilometragem,
  );

  app.get(
    '/manutencoes',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    FrotaController.listManutencoes,
  );
  app.get(
    '/manutencoes/:id',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    FrotaController.getManutencaoById,
  );
  app.post(
    '/manutencoes',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    FrotaController.createManutencao,
  );
  app.patch(
    '/manutencoes/:id',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    FrotaController.updateManutencao,
  );
  app.delete(
    '/manutencoes/:id',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN') },
    FrotaController.removeManutencao,
  );
}
