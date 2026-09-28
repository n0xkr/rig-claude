import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ImportacaoController } from './importacao.controller.js';

const LEITURA_TODOS = requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE', 'PORTARIA');
const ESCRITA_OPERACIONAL = requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR');

/** Rotas do Módulo 9 (Importação de dados — Excel/CSV, ponte até a integração com Google Sheets). */
export async function importacaoRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);

  app.get('/', { preHandler: LEITURA_TODOS }, ImportacaoController.listDatasets);
  app.post('/validar', { preHandler: ESCRITA_OPERACIONAL }, ImportacaoController.validar);
  app.post('/', { preHandler: ESCRITA_OPERACIONAL }, ImportacaoController.importar);
}
