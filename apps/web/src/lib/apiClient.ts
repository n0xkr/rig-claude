/**
 * Cliente HTTP fino para a API Rigabras. Centraliza base URL, headers de
 * autenticação e o parse de erros no formato RFC 7807.
 */
import type { UserRole } from '@rigabras/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3333/api/v1';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  correlationId?: string;
  errors?: Record<string, string[]>;
}

export class ApiError extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }
}

function getAccessToken(): string | null {
  return localStorage.getItem('rigabras_access_token');
}

/**
 * Decodifica (sem verificar assinatura) o papel (`role`) do usuário a partir
 * do access token JWT armazenado localmente, para uso exclusivo de gating de
 * UI (ex: esconder o botão "Aprovar financeiramente" para quem não é
 * ADMIN/SUPERADMIN — Módulo 3, critério #4). A autorização real sempre é
 * reforçada pelo backend (middleware RBAC + RLS do Supabase); isto é apenas
 * uma conveniência de UX, nunca um controle de acesso.
 */
export function getCurrentUserRole(): UserRole | null {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return null;
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(normalized)) as { role?: UserRole };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      body ?? {
        type: 'about:blank',
        title: 'Erro de rede',
        status: response.status,
        detail: 'Não foi possível interpretar a resposta do servidor',
      },
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
