import type { FastifyInstance } from 'fastify';
import { authenticate, requireEmails, requireRole } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { AuditoriaController } from './auditoria.controller.js';

/** Trilha de auditoria (critério #21) — leitura restrita aos e-mails de `AUDITORIA_EMAILS` (por padrão, só o proprietário do sistema) que também sejam ADMIN/SUPERADMIN. */
export async function auditoriaRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  // Duas travas: e-mail autorizado E papel administrativo. O cadastro de contas é aberto (`/auth/register`),
  // então só o e-mail não bastaria caso alguém se registrasse antes do dono com o mesmo endereço.
  app.get(
    '/',
    {
      preHandler: [
        requireRole('SUPERADMIN', 'ADMIN'),
        requireEmails(env.AUDITORIA_EMAILS.split(',')),
      ],
    },
    AuditoriaController.list,
  );
}
