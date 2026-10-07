import type { ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import type { ModuloKey } from '@rigabras/shared';
import { getCurrentUserRole } from '../lib/apiClient.js';
import { podeAcessar, rotaInicial } from '../lib/permissoes.js';

/**
 * Guarda de autenticação client-side: redireciona para `/login` quando não
 * há um access token válido em `localStorage` e, com `modulo`, mostra um aviso
 * quando a categoria/permissões do usuário não liberam aquele módulo. É só uma
 * conveniência de UX (evitar telas quebradas chamando a API sem permissão) — o
 * controle de acesso real continua 100% no backend (RBAC + `requireModulo` +
 * RLS do Supabase), exatamente como já documentado em `apiClient.ts`.
 */
export function AuthGate({ children, modulo }: { children: ReactNode; modulo?: ModuloKey }) {
  const role = getCurrentUserRole();
  if (!role) {
    return <Navigate to="/login" replace />;
  }
  if (modulo && !podeAcessar(modulo)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center" data-testid="sem-permissao">
        <Lock className="mx-auto h-10 w-10 text-slate-400" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Acesso não liberado</h1>
        <p className="mt-2 text-sm text-slate-500">
          Seu usuário não tem permissão para este módulo. Peça a um administrador para ajustar a sua
          categoria ou permissões.
        </p>
        <Link to={rotaInicial()} className="btn-primary mt-6 inline-flex">
          Ir para a tela inicial
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}

/** Rota `/`: abre a primeira tela liberada para o usuário. */
export function RotaInicial() {
  if (!getCurrentUserRole()) return <Navigate to="/login" replace />;
  return <Navigate to={rotaInicial()} replace />;
}
