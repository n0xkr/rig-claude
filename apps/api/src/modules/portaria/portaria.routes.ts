import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { PortariaController } from './portaria.controller.js';

const LEITURA_TODOS = requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE', 'PORTARIA');
const ESCRITA_PORTARIA = requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'PORTARIA');
const ESCRITA_OPERACIONAL = requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR');

/**
 * Rotas do Módulo 8 (Portaria). RBAC: leitura aberta a todos os papéis
 * autenticados; registro de entrada/documentos/saída liberado ao papel
 * PORTARIA (porteiro) além de OPERADOR/ADMIN/SUPERADMIN (mesmo racional
 * operacional dos módulos 2-5); conferência de documentos fica restrita a
 * OPERADOR+ (o porteiro registra, o operacional confere).
 */
export async function portariaRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);

  app.get('/entradas', { preHandler: LEITURA_TODOS }, PortariaController.listEntradas);
  app.get('/entradas/:id', { preHandler: LEITURA_TODOS }, PortariaController.getEntrada);
  app.post('/entradas', { preHandler: ESCRITA_PORTARIA }, PortariaController.registrarEntrada);
  app.patch(
    '/entradas/:id/status',
    { preHandler: ESCRITA_OPERACIONAL },
    PortariaController.atualizarStatus,
  );
  app.post(
    '/entradas/:id/documentos',
    { preHandler: ESCRITA_PORTARIA },
    PortariaController.anexarDocumento,
  );
  // Upload em 2 passos (o browser não tem sessão do Supabase Auth): 1) esta rota
  // devolve caminho + token assinado; 2) o browser envia o binário ao Storage;
  // 3) POST /documentos registra o metadado em portaria_documentos.
  app.post(
    '/entradas/:id/documentos/upload-url',
    { preHandler: ESCRITA_PORTARIA },
    PortariaController.solicitarUploadDocumento,
  );
  app.get(
    '/entradas/:id/documentos/:documentoId/url',
    { preHandler: LEITURA_TODOS },
    PortariaController.urlDocumento,
  );
  app.post(
    '/entradas/:id/saida',
    { preHandler: ESCRITA_PORTARIA },
    PortariaController.registrarSaida,
  );
  app.get('/kpis', { preHandler: LEITURA_TODOS }, PortariaController.kpis);
}
