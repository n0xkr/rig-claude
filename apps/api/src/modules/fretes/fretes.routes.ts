import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { FretesController } from './fretes.controller.js';

/**
 * Rotas aninhadas em /viagens/:viagemId/frete — relação 1:1 entre viagem e
 * frete contratado (ver comentário de modelagem na migration 0004).
 */
export async function fretesNestedRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.get(
    '/:viagemId/frete',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    FretesController.getByViagem,
  );
  app.post(
    '/:viagemId/frete',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    FretesController.createNested,
  );
}

/**
 * Rotas diretas em /fretes — CRUD do cabeçalho, máquina de estados do
 * fechamento, saldo do frete, lançamentos (adiantamento/desconto/multa) e
 * ledger de pagamentos. RBAC (critério #4): a conferência operacional
 * (criar, editar, iniciar/reencaminhar fechamento) é permitida a OPERADOR;
 * lançamentos financeiros e pagamentos — assim como a aprovação financeira e
 * o pagamento em si, aplicados dentro de `changeStatus` — ficam restritos a
 * ADMIN/SUPERADMIN, no mesmo padrão de `apolices_seguro` (dado financeiro).
 */
export async function fretesDirectRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);

  app.get(
    '/',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    FretesController.list,
  );
  app.get(
    '/:id',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    FretesController.getById,
  );
  app.post(
    '/',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    FretesController.create,
  );
  app.patch(
    '/:id',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    FretesController.update,
  );
  app.delete('/:id', { preHandler: requireRole('SUPERADMIN', 'ADMIN') }, FretesController.remove);

  // Máquina de estados do fechamento (a gating fina por transição/papel é
  // feita dentro do serviço, via PAPEIS_TRANSICAO_FECHAMENTO_FRETE).
  app.patch(
    '/:id/status',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    FretesController.changeStatus,
  );
  app.get(
    '/:id/status-history',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    FretesController.getStatusHistory,
  );

  app.get(
    '/:id/saldo',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    FretesController.getSaldo,
  );

  app.get(
    '/:id/lancamentos',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    FretesController.listLancamentos,
  );
  app.post(
    '/:id/lancamentos',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN') },
    FretesController.createLancamento,
  );
  app.delete(
    '/:id/lancamentos/:lancamentoId',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN') },
    FretesController.removeLancamento,
  );

  app.get(
    '/:id/pagamentos',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    FretesController.listPagamentos,
  );
  app.post(
    '/:id/pagamentos',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN') },
    FretesController.createPagamento,
  );
}
