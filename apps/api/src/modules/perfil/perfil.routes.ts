import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import { PerfilController } from './perfil.controller.js';

/** Painel do usuário: qualquer usuário autenticado lê/edita o próprio cadastro (exceto e-mail e papel). */
export async function perfilRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  // Foto de perfil vem como data URL (até ~200 KB): acima do limite padrão de 1 MB não passa de qualquer forma.
  app.get('/', PerfilController.obter);
  app.patch('/', PerfilController.atualizar);
}
