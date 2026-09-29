import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { MODULOS, temModulo, type ModuloKey, type UserRole } from '@rigabras/shared';
import { env } from '../config/env.js';
import { Problems } from '../lib/problemDetails.js';

export interface AccessTokenPayload {
  sub: string; // profile id
  email: string;
  role: UserRole;
  /** Módulos liberados; ausente/`null` = sem restrição (ver `resolverPermissoes`). */
  mods?: ModuloKey[] | null;
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
      await Problems.forbidden(
        reply,
        'A trilha de auditoria é restrita ao proprietário do sistema',
      );
    }
  };
}

export interface RegraModulo {
  /** Módulos que liberam QUALQUER método na rota (basta um). */
  modulos: ModuloKey[];
  /**
   * Módulos que liberam só leitura (GET/HEAD): telas de um módulo que exibem
   * dados de outro (ex.: o Painel lê `/frota/kpis`). `'todos'` = leitura livre
   * para qualquer usuário autenticado (cadastros-base como veículos).
   */
  leitura?: ModuloKey[] | 'todos';
}

const LABEL_MODULO = new Map<string, string>(MODULOS.map((m) => [m.key, m.label]));

/**
 * Permissões por módulo (categorias de usuário): complementa o RBAC por papel.
 * Registrado como hook `preHandler` no escopo do módulo (ver routes/index.ts),
 * roda depois do `authenticate` de cada rota. Rotas sem usuário (públicas ou já
 * respondidas com 401) seguem sem interferência.
 */
export function requireModulo(regra: RegraModulo) {
  return async function moduloGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (reply.sent || !request.user) return;
    const mods = request.user.role === 'SUPERADMIN' ? null : request.user.mods;
    if (mods == null) return;
    if (regra.modulos.some((m) => temModulo(mods, m))) return;
    const leitura = request.method === 'GET' || request.method === 'HEAD';
    if (leitura && (regra.leitura === 'todos' || regra.leitura?.some((m) => temModulo(mods, m)))) {
      return;
    }
    const nomes = regra.modulos.map((m) => LABEL_MODULO.get(m) ?? m).join(' / ');
    await Problems.forbidden(reply, `Seu usuário não tem permissão para o módulo ${nomes}`);
  };
}
