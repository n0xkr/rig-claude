import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ImportacaoController } from './importacao.controller.js';

const LEITURA_TODOS = requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE', 'PORTARIA');
const ESCRITA_OPERACIONAL = requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR');

/** Rotas do Módulo 9 (Importação de dados — Excel/CSV, com interpretação por IA). */
export async function importacaoRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);

  app.get('/', { preHandler: LEITURA_TODOS }, ImportacaoController.listDatasets);
  // Planilhas inteiras (várias abas, milhares de linhas): limite bem acima do padrão de 1 MB.
  app.post(
    '/inteligente',
    {
      preHandler: ESCRITA_OPERACIONAL,
      bodyLimit: 80 * 1024 * 1024,
      // Rota pesada (CPU + muitas escritas): limita repetição por usuário/IP.
      config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
    },
    ImportacaoController.inteligente,
  );
  app.post('/ia/analisar', { preHandler: ESCRITA_OPERACIONAL }, ImportacaoController.analisar);
  app.post('/validar', { preHandler: ESCRITA_OPERACIONAL }, ImportacaoController.validar);
  app.post('/', { preHandler: ESCRITA_OPERACIONAL }, ImportacaoController.importar);
}
