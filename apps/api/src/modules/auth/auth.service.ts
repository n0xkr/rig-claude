import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import type { UserRole } from "@rigabras/shared";
import { supabaseAdmin } from "../../config/supabase.js";
import { env } from "../../config/env.js";
import { DomainError } from "../../lib/errors.js";

export interface Session {
  accessToken: string;
  refreshToken: string;
  profile: { id: string; email: string; role: UserRole; nome_completo: string };
}

/**
 * Serviço de autenticação: delega a validação de senha ao Supabase Auth
 * (signInWithPassword) e emite o próprio access token (15 min) da API para
 * uso no RBAC + o refresh token rotativo (armazenado em cookie httpOnly).
 * O refresh token é persistido no Supabase (tabela auth.sessions é gerida
 * pelo próprio Supabase Auth); aqui apenas assinamos um JWT de rotação
 * próprio da API para desacoplar o backend do formato interno do Supabase.
 */
export class AuthService {
  async login(email: string, password: string): Promise<Session> {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      throw new DomainError("Falha na autenticação", 401, "E-mail ou senha inválidos");
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, role, nome_completo, ativo")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile || !profile.ativo) {
      throw new DomainError("Perfil inativo ou inexistente", 403, "Contate um administrador");
    }

    return this.issueSession({
      id: profile.id,
      email: profile.email,
      role: profile.role as UserRole,
      nome_completo: profile.nome_completo,
    });
  }

  issueSession(profile: Session["profile"]): Session {
    const accessToken = jwt.sign(
      { sub: profile.id, email: profile.email, role: profile.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
    );
    const refreshToken = jwt.sign(
      { sub: profile.id, jti: randomUUID(), type: "refresh" },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
    );
    return { accessToken, refreshToken, profile };
  }

  async refresh(refreshToken: string): Promise<Session> {
    let payload: { sub: string };
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { sub: string };
    } catch {
      throw new DomainError("Refresh token inválido", 401, "Faça login novamente");
    }

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, role, nome_completo, ativo")
      .eq("id", payload.sub)
      .single();

    if (error || !profile || !profile.ativo) {
      throw new DomainError("Perfil inativo ou inexistente", 403, "Contate um administrador");
    }

    // Rotação: um novo refresh token é emitido a cada uso (critério #4).
    return this.issueSession({
      id: profile.id,
      email: profile.email,
      role: profile.role as UserRole,
      nome_completo: profile.nome_completo,
    });
  }
}
