import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ErpExportController } from './erpExport.controller.js';

/**
 * Módulo 7 (Integração ERP): dados financeiros (contas a pagar/receber do
 * frete) e de estoque saem do sistema por aqui. RBAC restrito a
 * ADMIN/SUPERADMIN (nem OPERADOR, nem VISITANTE) — diferente da leitura
 * "aberta a todos" dos demais módulos: uma exportação em lote de dados
 * financeiros e de inventário é justamente o tipo de operação sensível que
 * o critério de segurança (RBAC granular) pede para restringir, mesmo sendo
 * uma rota GET.
 */
export async function erpExportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);

  const SOMENTE_ADMIN = requireRole('SUPERADMIN', 'ADMIN');

  app.get('/financeiro', { preHandler: SOMENTE_ADMIN }, ErpExportController.financeiro);
  app.get('/estoque', { preHandler: SOMENTE_ADMIN }, ErpExportController.estoque);
}
