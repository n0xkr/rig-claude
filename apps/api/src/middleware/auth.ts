import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@rigabras/shared';
import { env } from '../config/env.js';
import { Problems } from '../lib/problemDetails.js';

export interface AccessTokenPayload {
  sub: string; // profile id
  email: string;
  role: UserRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AccessTokenPayload;
  }
}

/**
 * Middleware de autenticação JWT: valida o access token (15 min de duração)
 * enviado via Authorization: Bearer <token>. O refresh token rotativo vive
 * apenas no cookie httpOnly (ver módulo auth).
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await Problems.unauthorized(reply, 'Token de acesso ausente');
    return;
  }
  const token = authHeader.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    request.user = payload;
  } catch {
    await Problems.unauthorized(reply, 'Token de acesso inválido ou expirado');
  }
}

/**
 * Middleware RBAC (critério #4): garante que o usuário autenticado possua um
 * dos papéis permitidos para a rota. Deve ser usado após `authenticate`.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      await Problems.unauthorized(reply);
      return;
    }
    // SUPERADMIN tem acesso irrestrito a todas as rotas protegidas por papel.
    if (request.user.role !== 'SUPERADMIN' && !allowedRoles.includes(request.user.role)) {
      await Problems.forbidden(reply, `Esta ação requer um dos papéis: ${allowedRoles.join(', ')}`);
    }
  };
}

/**
 * Restringe a rota a e-mails específicos (lista em `AUDITORIA_EMAILS`). Usado na
 * Auditoria: por decisão do dono do sistema, só ele a acessa — nem o papel
 * SUPERADMIN a enxerga. Deve ser usado após `authenticate`.
 */
export function requireEmails(allowedEmails: string[]) {
  const allowed = new Set(allowedEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  return async function emailGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      await Problems.unauthorized(reply);
      return;
    }
    if (!allowed.has(request.user.email.trim().toLowerCase())) {
      await Problems.forbidden(reply, 'A trilha de auditoria é restrita ao proprietário do sistema');
    }
  };
}
