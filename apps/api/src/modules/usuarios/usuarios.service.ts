import { supabaseAdmin } from '../../config/supabase.js';
import { DomainError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';
import type { UserRole } from '@rigabras/shared';

export interface UsuarioInput {
  nome_completo: string;
  email: string;
  password: string;
  role: UserRole;
  ativo?: boolean;
}

export interface UsuarioPatch {
  nome_completo?: string;
  role?: UserRole;
  ativo?: boolean;
  password?: string;
}

const COLUMNS = 'id, email, nome_completo, role, ativo, created_at';

/** Gestão de usuários (perfis + contas do Supabase Auth) — uso exclusivo de SUPERADMIN. */
export class UsuariosService {
  async list() {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select(COLUMNS)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw new DomainError('Falha ao listar usuários', 500, error.message);
    return data ?? [];
  }

  async create(input: UsuarioInput, actorId: string, ip: string | null) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });
    if (error || !data.user) {
      const conflict = error?.status === 422 || /already been registered/i.test(error?.message ?? '');
      throw new DomainError(
        'Falha ao criar usuário',
        conflict ? 409 : 400,
        conflict ? 'Este e-mail já está cadastrado' : (error?.message ?? 'Não foi possível criar a conta'),
      );
    }
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: data.user.id,
        email: input.email,
        nome_completo: input.nome_completo,
        role: input.role,
        ativo: input.ativo ?? true,
      })
      .select(COLUMNS)
      .single();
    if (profileError || !profile) {
      await supabaseAdmin.auth.admin.deleteUser(data.user.id);
      throw new DomainError('Falha ao criar usuário', 500, 'Não foi possível criar o perfil');
    }
    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      entity: 'usuarios',
      entityId: profile.id,
      changes: { email: profile.email, role: profile.role },
      ip,
    });
    return profile;
  }

  async update(id: string, patch: UsuarioPatch, actorId: string, ip: string | null) {
    if (id === actorId && (patch.role !== undefined || patch.ativo === false)) {
      throw new DomainError(
        'Ação não permitida',
        422,
        'Você não pode rebaixar nem desativar a sua própria conta',
      );
    }
    const { password, ...profileFields } = patch;
    if (password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
      if (error) throw new DomainError('Falha ao alterar a senha', 400, error.message);
    }
    if (Object.keys(profileFields).length === 0) {
      const { data } = await supabaseAdmin.from('profiles').select(COLUMNS).eq('id', id).single();
      if (!data) throw new NotFoundError('Usuário', id);
      return data;
    }
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(profileFields)
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (error || !data) throw new NotFoundError('Usuário', id);
    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      entity: 'usuarios',
      entityId: id,
      changes: { ...profileFields, ...(password ? { password: '[alterada]' } : {}) },
      ip,
    });
    return data;
  }

  async remove(id: string, actorId: string, ip: string | null) {
    if (id === actorId) {
      throw new DomainError('Ação não permitida', 422, 'Você não pode excluir a sua própria conta');
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) throw new DomainError('Falha ao excluir usuário', 400, error.message);
    await writeAuditLog({
      userId: actorId,
      action: 'DELETE',
      entity: 'usuarios',
      entityId: id,
      changes: null,
      ip,
    });
  }
}
