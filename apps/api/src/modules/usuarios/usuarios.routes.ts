import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { UsuariosController } from './usuarios.controller.js';

/** Gestão de usuários — exclusiva de SUPERADMIN. */
export async function usuariosRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.addHook('preHandler', requireRole('SUPERADMIN'));
  app.get('/', UsuariosController.list);
  app.post('/', UsuariosController.create);
  app.patch('/:id', UsuariosController.update);
  app.delete('/:id', UsuariosController.remove);
}
