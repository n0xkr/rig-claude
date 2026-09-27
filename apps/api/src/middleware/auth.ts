import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import type { UserRole } from "@rigabras/shared";
import { env } from "../config/env.js";
import { Problems } from "../lib/problemDetails.js";

export interface AccessTokenPayload {
  sub: string; // profile id
  email: string;
  role: UserRole;
}

declare module "fastify" {
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
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    await Problems.unauthorized(reply, "Token de acesso ausente");
    return;
  }
  const token = authHeader.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    request.user = payload;
  } catch {
    await Problems.unauthorized(reply, "Token de acesso inválido ou expirado");
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
    if (!allowedRoles.includes(request.user.role)) {
      await Problems.forbidden(
        reply,
        `Esta ação requer um dos papéis: ${allowedRoles.join(", ")}`,
      );
    }
  };
}
