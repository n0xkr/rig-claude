import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { UserRole } from '@rigabras/shared';
import { supabaseAdmin, createPasswordAuthClient } from '../../config/supabase.js';
import { env } from '../../config/env.js';
import { DomainError } from '../../lib/errors.js';

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
  /**
   * Autocadastro: cria o usuário no Supabase Auth e o respectivo `profiles`
   * já `ativo`, papel padrão `VISITANTE` (o menos privilegiado do RBAC —
   * promoção a OPERADOR/ADMIN é feita manualmente por um admin depois).
   */
  async register(email: string, password: string, nomeCompleto: string): Promise<Session> {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      const isConflict = error?.status === 422 || /already been registered/i.test(error?.message ?? '');
      throw new DomainError(
        'Falha no cadastro',
        isConflict ? 409 : 400,
        isConflict ? 'Este e-mail já está cadastrado' : (error?.message ?? 'Não foi possível criar a conta'),
      );
    }

    // O trigger `on_auth_user_created` do banco já cria um profile ao inserir em
    // auth.users; upsert por id evita a violação de PK e grava o nome informado.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: data.user.id,
          // O Auth normaliza o e-mail (minúsculas); usar o dele evita divergir de profiles.email.
          email: data.user.email ?? email,
          nome_completo: nomeCompleto,
          role: 'VISITANTE',
          ativo: true,
          deleted_at: null,
        },
        { onConflict: 'id' },
      )
      .select('id, email, role, nome_completo, ativo')
      .single();

    if (profileError || !profile) {
      // Reverte o usuário de Auth para não deixar uma conta órfã sem profile.
      await supabaseAdmin.auth.admin.deleteUser(data.user.id);
      throw new DomainError(
        'Falha no cadastro',
        500,
        `Não foi possível criar o perfil do usuário${profileError ? `: ${profileError.message}` : ''}`,
      );
    }

    return this.issueSession({
      id: profile.id,
      email: profile.email,
      role: profile.role as UserRole,
      nome_completo: profile.nome_completo,
    });
  }

  async login(email: string, password: string): Promise<Session> {
    const { data, error } = await createPasswordAuthClient().auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.user) {
      throw new DomainError('Falha na autenticação', 401, 'E-mail ou senha inválidos');
    }

    const profile = await this.findProfileAtivo(data.user.id);

    return this.issueSession({
      id: profile.id,
      email: profile.email,
      role: profile.role as UserRole,
      nome_completo: profile.nome_completo,
    });
  }

  /**
   * Busca o profile ativo (e não excluído — `deleted_at` é soft delete). Um erro
   * real do banco vira 500 em vez de ser confundido com "perfil inexistente".
   */
  private async findProfileAtivo(id: string) {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, nome_completo, ativo')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) {
      throw new DomainError('Falha ao carregar o perfil', 500, error.message);
    }
    if (!profile || !profile.ativo) {
      throw new DomainError('Perfil inativo ou inexistente', 403, 'Contate um administrador');
    }
    return profile;
  }

  issueSession(profile: Session['profile']): Session {
    const accessToken = jwt.sign(
      { sub: profile.id, email: profile.email, role: profile.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    );
    const refreshToken = jwt.sign(
      { sub: profile.id, jti: randomUUID(), type: 'refresh' },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    );
    return { accessToken, refreshToken, profile };
  }

  async refresh(refreshToken: string): Promise<Session> {
    let payload: { sub: string };
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { sub: string };
    } catch {
      throw new DomainError('Refresh token inválido', 401, 'Faça login novamente');
    }

    const profile = await this.findProfileAtivo(payload.sub);

    // Rotação: um novo refresh token é emitido a cada uso (critério #4).
    return this.issueSession({
      id: profile.id,
      email: profile.email,
      role: profile.role as UserRole,
      nome_completo: profile.nome_completo,
    });
  }
}
