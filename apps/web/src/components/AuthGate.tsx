import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getCurrentUserRole } from '../lib/apiClient.js';

/**
 * Guarda de autenticação client-side: redireciona para `/login` quando não
 * há um access token válido em `localStorage`. É só uma conveniência de UX
 * (evitar telas quebradas chamando a API sem token) — o controle de acesso
 * real continua 100% no backend (middleware RBAC + RLS do Supabase), exatamente
 * como já documentado para `getCurrentUserRole()` em `apiClient.ts`.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const role = getCurrentUserRole();
  if (!role) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
