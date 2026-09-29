import { temModulo, type ModuloKey } from '@rigabras/shared';
import { getCurrentUserRole } from './apiClient.js';

/**
 * Módulos liberados para o usuário logado, lidos do access token (`mods`).
 * `null` = sem restrição. Como o papel, é só gating de UX: a API aplica as
 * mesmas regras (middleware `requireModulo`).
 */
export function getCurrentUserModulos(): ModuloKey[] | null {
  const token = localStorage.getItem('rigabras_access_token');
  if (!token) return null;
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return null;
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(normalized)) as { mods?: ModuloKey[] | null };
    return Array.isArray(payload.mods) ? payload.mods : null;
  } catch {
    return null;
  }
}

export function podeAcessar(modulo: ModuloKey): boolean {
  if (getCurrentUserRole() === 'SUPERADMIN') return true;
  return temModulo(getCurrentUserModulos(), modulo);
}

/** Tela inicial de cada módulo, na ordem de preferência após o login. */
const ROTA_INICIAL: Array<[ModuloKey, string]> = [
  ['viagens', '/viagens'],
  ['painel', '/dashboard'],
  ['acompanhamento', '/acompanhamento'],
  ['portaria', '/portaria'],
  ['fretes', '/fretes'],
  ['frota', '/frota/kpis'],
  ['jornada', '/jornada'],
  ['wms', '/wms'],
  ['fronteira', '/fronteira/kpis'],
  ['rigabras_ai', '/rigabras-ai'],
  ['exportacoes', '/exportacoes'],
  ['importacao', '/importar-dados'],
  ['solicitacoes_ia', '/solicitacoes-ia'],
];

/** Primeira tela que o usuário pode abrir (o Perfil é sempre liberado). */
export function rotaInicial(): string {
  return ROTA_INICIAL.find(([m]) => podeAcessar(m))?.[1] ?? '/perfil';
}
