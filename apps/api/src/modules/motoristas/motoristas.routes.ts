import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { MotoristasController } from './motoristas.controller.js';

export async function motoristasRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.get(
    '/',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    MotoristasController.list,
  );
  // OCR: fotos de CNH/CRLV (até 3) em base64 — limite maior que o padrão de 1 MB.
  app.post(
    '/ocr',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR'), bodyLimit: 45 * 1024 * 1024 },
    MotoristasController.ocr,
  );
  app.get(
    '/:id/documentos',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    MotoristasController.listarDocumentos,
  );
  app.post(
    '/:id/documentos',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR'), bodyLimit: 45 * 1024 * 1024 },
    MotoristasController.enviarDocumentos,
  );
  app.delete(
    '/:id/documentos/:docId',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN') },
    MotoristasController.excluirDocumento,
  );
  app.get(
    '/:id',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE') },
    MotoristasController.getById,
  );
  app.post(
    '/',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    MotoristasController.create,
  );
  app.patch(
    '/:id',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR') },
    MotoristasController.update,
  );
  app.delete(
    '/:id',
    { preHandler: requireRole('SUPERADMIN', 'ADMIN') },
    MotoristasController.remove,
  );
}
