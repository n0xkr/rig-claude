import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { ModuloKey, UserRole } from '@rigabras/shared';
import { supabaseAdmin, createPasswordAuthClient } from '../../config/supabase.js';
import { env, JWT_AUDIENCE, JWT_ISSUER } from '../../config/env.js';
import { DomainError } from '../../lib/errors.js';
import { carregarPermissoesEfetivas, isSchemaAusente } from '../../lib/permissoes.js';

export interface Session {
  accessToken: string;
  refreshToken: string;
  profile: { id: string; email: string; role: UserRole; nome_completo: string };
  /** Módulos liberados (`null` = todos); também vai no access token como `mods`. */
  permissoes: ModuloKey[] | null;
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
    if (!env.ALLOW_PUBLIC_REGISTRATION) {
      throw new DomainError(
        'Cadastro desativado',
        403,
        'O cadastro é feito por um administrador. Solicite seu acesso.',
      );
    }
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      const isConflict =
        error?.status === 422 || /already been registered/i.test(error?.message ?? '');
      throw new DomainError(
        'Falha no cadastro',
        isConflict ? 409 : 400,
        isConflict
          ? 'Este e-mail já está cadastrado'
          : (error?.message ?? 'Não foi possível criar a conta'),
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

    return this.sessionFromProfile(await this.findProfileAtivo(data.user.id));
  }

  /**
   * Busca o profile ativo (e não excluído — `deleted_at` é soft delete). Um erro
   * real do banco vira 500 em vez de ser confundido com "perfil inexistente".
   */
  private async findProfileAtivo(id: string) {
    // `*` em vez de lista fixa: inclui `categoria_id`/`permissoes` quando a
    // migration 0013 já foi aplicada, sem quebrar o login enquanto não foi.
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
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

  private async sessionFromProfile(row: {
    id: string;
    email: string;
    role: string;
    nome_completo: string;
    permissoes?: string[] | null;
    categoria_id?: string | null;
  }): Promise<Session> {
    const permissoes = await carregarPermissoesEfetivas(row);
    return this.issueSession(
      {
        id: row.id,
        email: row.email,
        role: row.role as UserRole,
        nome_completo: row.nome_completo,
      },
      permissoes,
    );
  }

  async issueSession(
    profile: Session['profile'],
    permissoes: ModuloKey[] | null = null,
    familyId: string = randomUUID(),
  ): Promise<Session> {
    const base = { issuer: JWT_ISSUER, audience: JWT_AUDIENCE } as const;
    const accessToken = jwt.sign(
      { sub: profile.id, email: profile.email, role: profile.role, mods: permissoes },
      env.JWT_ACCESS_SECRET,
      { ...base, expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    );
    const jti = randomUUID();
    const refreshToken = jwt.sign(
      { sub: profile.id, jti, fam: familyId, type: 'refresh' },
      env.JWT_REFRESH_SECRET,
      { ...base, expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    );
    const decoded = jwt.decode(refreshToken) as { exp: number };
    const { error } = await supabaseAdmin.from('refresh_tokens').insert({
      jti,
      family_id: familyId,
      user_id: profile.id,
      expires_at: new Date(decoded.exp * 1000).toISOString(),
    });
    // Migration 0017 pendente: degrada para o comportamento anterior (sem revogação).
    if (error && !isSchemaAusente(error)) {
      throw new DomainError('Falha ao registrar a sessão', 500, error.message);
    }
    return { accessToken, refreshToken, profile, permissoes };
  }

  /** Revoga o refresh token (logout) e toda a sua família. Idempotente e silencioso. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      const p = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        ignoreExpiration: true,
      }) as { fam?: string };
      if (p.fam) await this.revogarFamilia(p.fam);
    } catch {
      /* token inválido: nada a revogar */
    }
  }

  private async revogarFamilia(familyId: string): Promise<void> {
    await supabaseAdmin
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('family_id', familyId)
      .is('revoked_at', null);
  }

  async refresh(refreshToken: string): Promise<Session> {
    let payload: { sub: string; type?: string; jti?: string; fam?: string };
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }) as typeof payload;
      if (payload.type !== 'refresh') throw new Error('tipo de token inválido');
    } catch {
      throw new DomainError('Refresh token inválido', 401, 'Faça login novamente');
    }

    // Rotação com uso único: marca o jti como usado de forma atômica. Se já foi
    // usado/revogado, é reutilização (possível roubo): invalida a família inteira.
    if (payload.jti && payload.fam) {
      const { data, error } = await supabaseAdmin
        .from('refresh_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('jti', payload.jti)
        .is('used_at', null)
        .is('revoked_at', null)
        .select('jti');
      if (error && !isSchemaAusente(error)) {
        throw new DomainError('Falha ao renovar a sessão', 500, error.message);
      }
      if (!error && (data ?? []).length === 0) {
        await this.revogarFamilia(payload.fam);
        throw new DomainError('INVALID_REFRESH_TOKEN', 401, 'Sessão inválida. Faça login novamente');
      }
    }

    const row = await this.findProfileAtivo(payload.sub);
    const permissoes = await carregarPermissoesEfetivas(row);
    return this.issueSession(
      {
        id: row.id,
        email: row.email,
        role: row.role as UserRole,
        nome_completo: row.nome_completo,
      },
      permissoes,
      payload.fam,
    );
  }
}
