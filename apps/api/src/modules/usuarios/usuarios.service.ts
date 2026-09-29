import { supabaseAdmin } from '../../config/supabase.js';
import { DomainError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';
import { isSchemaAusente, MIGRATION_0013_PENDENTE } from '../../lib/permissoes.js';
import type { ModuloKey, UserRole } from '@rigabras/shared';

export interface UsuarioInput {
  nome_completo: string;
  email: string;
  password: string;
  role: UserRole;
  ativo?: boolean;
  categoria_id?: string | null;
  permissoes?: ModuloKey[] | null;
}

export interface UsuarioPatch {
  nome_completo?: string;
  role?: UserRole;
  ativo?: boolean;
  password?: string;
  categoria_id?: string | null;
  permissoes?: ModuloKey[] | null;
}

export interface Usuario {
  id: string;
  email: string;
  nome_completo: string;
  role: UserRole;
  ativo: boolean;
  created_at: string;
  categoria_id: string | null;
  /** Lista própria do usuário; `null` = herda da categoria (ou todos os módulos). */
  permissoes: ModuloKey[] | null;
}

/** Bloqueio "permanente" no Supabase Auth para contas excluídas logicamente. */
const BANIDO = '876000h';

type Row = Record<string, unknown>;

/**
 * `select('*')` + este mapeamento (em vez de uma lista fixa de colunas) mantém a
 * tela funcionando antes e depois da migration 0013 (categoria_id/permissoes).
 */
function toUsuario(row: Row): Usuario {
  return {
    id: row.id as string,
    email: row.email as string,
    nome_completo: row.nome_completo as string,
    role: row.role as UserRole,
    ativo: row.ativo as boolean,
    created_at: row.created_at as string,
    categoria_id: (row.categoria_id as string | null | undefined) ?? null,
    permissoes: (row.permissoes as ModuloKey[] | null | undefined) ?? null,
  };
}

/** Erros de gravação em `profiles` com mensagem útil em vez de 500 genérico. */
function erroProfile(titulo: string, error: { code?: string; message: string }): DomainError {
  if (isSchemaAusente(error)) return new DomainError(titulo, 503, MIGRATION_0013_PENDENTE);
  if (error.code === '23503') return new DomainError(titulo, 422, 'Categoria inexistente');
  return new DomainError(titulo, 500, error.message);
}

/** Só envia categoria/permissões quando informadas: sem a migration 0013 as colunas não existem. */
function camposAcesso(input: {
  categoria_id?: string | null;
  permissoes?: ModuloKey[] | null;
}): Row {
  const campos: Row = {};
  if (input.categoria_id !== undefined) campos.categoria_id = input.categoria_id;
  if (input.permissoes !== undefined) campos.permissoes = input.permissoes;
  return campos;
}

/** Gestão de usuários (perfis + contas do Supabase Auth) — uso exclusivo de SUPERADMIN. */
export class UsuariosService {
  async list(): Promise<Usuario[]> {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw new DomainError('Falha ao listar usuários', 500, error.message);
    return ((data ?? []) as Row[]).map(toUsuario);
  }

  async create(input: UsuarioInput, actorId: string, ip: string | null): Promise<Usuario> {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });
    if (error || !data.user) {
      const conflict =
        error?.status === 422 || /already been registered/i.test(error?.message ?? '');
      if (conflict) {
        // E-mail de uma conta excluída logicamente (tinha histórico): reativa a mesma conta.
        const restaurado = await this.restaurarExcluido(input, actorId, ip);
        if (restaurado) return restaurado;
      }
      throw new DomainError(
        'Falha ao criar usuário',
        conflict ? 409 : 400,
        conflict
          ? 'Este e-mail já está cadastrado'
          : (error?.message ?? 'Não foi possível criar a conta'),
      );
    }
    // O trigger `on_auth_user_created` (handle_new_user) do banco já cria um
    // profile básico (VISITANTE) ao inserir em auth.users — por isso upsert
    // por id, e não insert, para gravar nome/papel/ativo escolhidos.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: data.user.id,
          email: data.user.email ?? input.email,
          nome_completo: input.nome_completo,
          role: input.role,
          ativo: input.ativo ?? true,
          deleted_at: null,
          ...camposAcesso(input),
        },
        { onConflict: 'id' },
      )
      .select('*')
      .single();
    if (profileError || !profile) {
      await supabaseAdmin.auth.admin.deleteUser(data.user.id);
      if (profileError) throw erroProfile('Falha ao criar usuário', profileError);
      throw new DomainError('Falha ao criar usuário', 500, 'Não foi possível criar o perfil');
    }
    const usuario = toUsuario(profile as Row);
    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      entity: 'usuarios',
      entityId: usuario.id,
      changes: { email: usuario.email, role: usuario.role, ...camposAcesso(input) },
      ip,
    });
    return usuario;
  }

  private async restaurarExcluido(
    input: UsuarioInput,
    actorId: string,
    ip: string | null,
  ): Promise<Usuario | null> {
    const { data: antigo, error } = await supabaseAdmin
      .from('profiles')
      .select('id, deleted_at')
      .eq('email', input.email)
      .maybeSingle();
    if (error || !antigo || !antigo.deleted_at) return null;
    const antigoId = antigo.id as string;
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(antigoId, {
      password: input.password,
      ban_duration: 'none',
    });
    if (authError) throw new DomainError('Falha ao reativar usuário', 400, authError.message);
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        nome_completo: input.nome_completo,
        role: input.role,
        ativo: input.ativo ?? true,
        deleted_at: null,
        ...camposAcesso(input),
      })
      .eq('id', antigoId)
      .select('*')
      .single();
    if (profileError || !profile) {
      throw profileError
        ? erroProfile('Falha ao reativar usuário', profileError)
        : new NotFoundError('Usuário', antigoId);
    }
    const usuario = toUsuario(profile as Row);
    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      entity: 'usuarios',
      entityId: usuario.id,
      changes: { reativado: true, email: usuario.email, role: usuario.role },
      ip,
    });
    return usuario;
  }

  async update(
    id: string,
    patch: UsuarioPatch,
    actorId: string,
    ip: string | null,
  ): Promise<Usuario> {
    if (id === actorId && (patch.role !== undefined || patch.ativo === false)) {
      throw new DomainError(
        'Ação não permitida',
        422,
        'Você não pode rebaixar nem desativar a sua própria conta',
      );
    }
    const { password, categoria_id, permissoes, ...basicos } = patch;
    const profileFields: Row = { ...basicos, ...camposAcesso({ categoria_id, permissoes }) };
    if (password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
      if (error) throw new DomainError('Falha ao alterar a senha', 400, error.message);
    }
    let data: Row | null;
    if (Object.keys(profileFields).length === 0) {
      // Só a senha mudou (Auth): apenas relê o profile para devolver ao cliente.
      const res = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();
      if (res.error) throw new DomainError('Falha ao carregar usuário', 500, res.error.message);
      data = res.data as Row | null;
    } else {
      const res = await supabaseAdmin
        .from('profiles')
        .update(profileFields)
        .eq('id', id)
        .is('deleted_at', null)
        .select('*')
        .maybeSingle();
      if (res.error) throw erroProfile('Falha ao atualizar usuário', res.error);
      data = res.data as Row | null;
    }
    if (!data) throw new NotFoundError('Usuário', id);
    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      entity: 'usuarios',
      entityId: id,
      changes: { ...profileFields, ...(password ? { password: '[alterada]' } : {}) },
      ip,
    });
    return toUsuario(data);
  }

  /**
   * Exclui a conta. Sem histórico, remove de vez (Auth + profile em cascata).
   * Com histórico vinculado (viagens, fretes... referenciam `profiles` sem
   * cascata, e o banco recusa), faz exclusão lógica: some da lista, perde o
   * acesso (profile inativo + conta bloqueada no Auth) e os registros
   * históricos continuam apontando para quem os criou.
   */
  async remove(
    id: string,
    actorId: string,
    ip: string | null,
  ): Promise<{ modo: 'definitiva' | 'logica' }> {
    if (id === actorId) {
      throw new DomainError('Ação não permitida', 422, 'Você não pode excluir a sua própria conta');
    }
    const { data: alvo, error: alvoError } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (alvoError) throw new DomainError('Falha ao carregar usuário', 500, alvoError.message);
    if (!alvo) throw new NotFoundError('Usuário', id);

    let modo: 'definitiva' | 'logica' = 'definitiva';
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) {
      if (!/database error/i.test(error.message)) {
        throw new DomainError('Falha ao excluir usuário', 400, error.message);
      }
      modo = 'logica';
      const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(id, {
        ban_duration: BANIDO,
      });
      if (banError) throw new DomainError('Falha ao excluir usuário', 400, banError.message);
      const { error: softError } = await supabaseAdmin
        .from('profiles')
        .update({ ativo: false, deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (softError) throw new DomainError('Falha ao excluir usuário', 500, softError.message);
    }
    await writeAuditLog({
      userId: actorId,
      action: 'DELETE',
      entity: 'usuarios',
      entityId: id,
      changes: { email: alvo.email, modo },
      ip,
    });
    return { modo };
  }
}
