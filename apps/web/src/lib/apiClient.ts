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

/** E-mail do usuário a partir do JWT (só para exibição/UX; a autorização real é do backend). */
export function getCurrentUserEmail(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return null;
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(normalized)) as { email?: string };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

let refreshEmAndamento: Promise<boolean> | null = null;

/**
 * O access token da API dura só 15 min (JWT_ACCESS_EXPIRES_IN) e o front nunca o
 * renovava: depois disso toda chamada dava 401 e o usuário ficava preso numa tela
 * quebrada. Renova via cookie httpOnly do refresh token (`POST /auth/refresh`),
 * compartilhando uma única requisição entre chamadas concorrentes (o refresh é rotativo).
 */
function renovarAccessToken(): Promise<boolean> {
  refreshEmAndamento ??= (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) return false;
      const body = (await response.json().catch(() => null)) as { accessToken?: string } | null;
      if (!body?.accessToken) return false;
      localStorage.setItem('rigabras_access_token', body.accessToken);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshEmAndamento = null;
  });
  return refreshEmAndamento;
}

/** Sessão irrecuperável (refresh recusado/expirado): limpa o token e volta ao login. */
function encerrarSessao(): void {
  localStorage.removeItem('rigabras_access_token');
  if (window.location.pathname !== '/login' && window.location.pathname !== '/registro') {
    window.location.assign('/login');
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit, jaRenovou = false): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      // Bug real encontrado nesta sessão: `Content-Type: application/json`
      // era enviado mesmo em requisições sem corpo (ex: `POST
      // /wms/recebimentos/:id/iniciar-conferencia`, chamada como
      // `api.post(path)` sem segundo argumento) — o parser de JSON do
      // Fastify rejeita isso com 400 `FST_ERR_CTP_EMPTY_JSON_BODY` ("Body
      // cannot be empty when content-type is set to 'application/json'").
      // Isso quebrava TODOS os botões de transição sem payload do Módulo 5
      // (iniciar conferência/concluir de recebimento, iniciar
      // separação/pronta para expedição/expedir/cancelar de expedição,
      // iniciar contagem/reconciliar/encerrar de inventário) — nunca detectado
      // antes porque essas rotas nunca tinham sido exercitadas pela UI real.
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  // 401 fora das rotas de auth = access token expirado: renova uma vez e repete a chamada.
  if (response.status === 401 && !jaRenovou && !path.startsWith('/auth/')) {
    if (await renovarAccessToken()) return apiFetch<T>(path, init, true);
    encerrarSessao();
  }

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

/**
 * Baixa uma resposta não-JSON (ex: anexo CSV do Módulo 7 — Integração ERP)
 * como um Blob, para disparar o download no navegador. Trata erros no
 * mesmo formato RFC 7807 de `apiFetch` quando a resposta não é `ok`.
 */
export async function apiFetchBlob(
  path: string,
  jaRenovou = false,
): Promise<{ blob: Blob; filename: string | null }> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (response.status === 401 && !jaRenovou) {
    if (await renovarAccessToken()) return apiFetchBlob(path, true);
    encerrarSessao();
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      body ?? {
        type: 'about:blank',
        title: 'Erro de rede',
        status: response.status,
        detail: 'Não foi possível interpretar a resposta do servidor',
      },
    );
  }

  const disposition = response.headers.get('Content-Disposition');
  const match = disposition?.match(/filename="?([^"]+)"?/);
  return { blob: await response.blob(), filename: match?.[1] ?? null };
}
