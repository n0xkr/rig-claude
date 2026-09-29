import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { IaSolicitacoesController } from './iaSolicitacoes.controller.js';

/** Aprovar/recusar/responder é decisão de administrador (SUPERADMIN passa por qualquer `requireRole`). */
const DECIDE = requireRole('SUPERADMIN', 'ADMIN');
const ENVIA_PLANILHA = requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR');

/** Fila "Solicitações da IA": a IA propõe, o administrador decide. */
export async function iaSolicitacoesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.get('/', { preHandler: DECIDE }, IaSolicitacoesController.listar);
  app.get('/resumo', { preHandler: DECIDE }, IaSolicitacoesController.resumo);
  app.post('/aprovar-lote', { preHandler: DECIDE }, IaSolicitacoesController.aprovarLote);
  app.post('/:id/aprovar', { preHandler: DECIDE }, IaSolicitacoesController.aprovar);
  app.post('/:id/recusar', { preHandler: DECIDE }, IaSolicitacoesController.recusar);
  app.post('/:id/responder', { preHandler: DECIDE }, IaSolicitacoesController.responder);
}

/** Importação de planilha completa com IA: registrado em `/importacoes/lotes`. */
export async function importacaoLotesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.post('/', { preHandler: ENVIA_PLANILHA }, IaSolicitacoesController.criarLote);
  // Uma aba pode ter milhares de linhas: limite maior que o padrão de 1 MB.
  app.post('/:id/abas', { preHandler: ENVIA_PLANILHA, bodyLimit: 30 * 1024 * 1024 }, IaSolicitacoesController.analisarAba);
  app.post('/:id/concluir', { preHandler: ENVIA_PLANILHA }, IaSolicitacoesController.concluirLote);
}
