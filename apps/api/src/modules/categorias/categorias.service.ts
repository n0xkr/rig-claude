import type {
  CategoriaUsuario,
  CreateCategoriaUsuarioInput,
  UpdateCategoriaUsuarioInput,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { DomainError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';
import { isSchemaAusente, MIGRATION_0013_PENDENTE } from '../../lib/permissoes.js';

const COLUMNS = 'id, nome, descricao, permissoes, created_at, updated_at';

function falha(titulo: string, error: { code?: string; message: string }): DomainError {
  if (isSchemaAusente(error)) return new DomainError(titulo, 503, MIGRATION_0013_PENDENTE);
  if (error.code === '23505') {
    return new DomainError(titulo, 409, 'Já existe uma categoria com este nome');
  }
  return new DomainError(titulo, 500, error.message);
}

/**
 * Categorias de usuário (grupos de permissões por módulo) — uso exclusivo de
 * SUPERADMIN. Excluir uma categoria não exclui usuários: o FK
 * `profiles.categoria_id` é `on delete set null`, e eles voltam a ter acesso
 * definido só pelo papel (ou pela lista própria de permissões, se houver).
 */
export class CategoriasService {
  async list(): Promise<CategoriaUsuario[]> {
    const { data, error } = await supabaseAdmin
      .from('categorias_usuario')
      .select(COLUMNS)
      .order('nome', { ascending: true });
    if (error) throw falha('Falha ao listar categorias', error);

    const { data: perfis, error: perfisError } = await supabaseAdmin
      .from('profiles')
      .select('categoria_id')
      .is('deleted_at', null);
    if (perfisError) throw falha('Falha ao listar categorias', perfisError);
    const totais = new Map<string, number>();
    for (const p of (perfis ?? []) as Array<{ categoria_id: string | null }>) {
      if (p.categoria_id) totais.set(p.categoria_id, (totais.get(p.categoria_id) ?? 0) + 1);
    }
    return ((data ?? []) as CategoriaUsuario[]).map((c) => ({
      ...c,
      total_usuarios: totais.get(c.id) ?? 0,
    }));
  }

  async create(
    input: CreateCategoriaUsuarioInput,
    actorId: string,
    ip: string | null,
  ): Promise<CategoriaUsuario> {
    const { data, error } = await supabaseAdmin
      .from('categorias_usuario')
      .insert({ ...input, created_by: actorId })
      .select(COLUMNS)
      .single();
    if (error || !data) {
      throw error
        ? falha('Falha ao criar categoria', error)
        : new DomainError('Falha ao criar categoria', 500);
    }
    const categoria = data as CategoriaUsuario;
    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      entity: 'categorias_usuario',
      entityId: categoria.id,
      changes: { after: categoria },
      ip,
    });
    return { ...categoria, total_usuarios: 0 };
  }

  async update(
    id: string,
    patch: UpdateCategoriaUsuarioInput,
    actorId: string,
    ip: string | null,
  ): Promise<CategoriaUsuario> {
    if (Object.keys(patch).length === 0) {
      throw new DomainError('Nada para atualizar', 422, 'Informe nome, descrição ou permissões');
    }
    const { data, error } = await supabaseAdmin
      .from('categorias_usuario')
      .update(patch)
      .eq('id', id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw falha('Falha ao atualizar categoria', error);
    if (!data) throw new NotFoundError('Categoria', id);
    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      entity: 'categorias_usuario',
      entityId: id,
      changes: patch,
      ip,
    });
    return data as CategoriaUsuario;
  }

  async remove(id: string, actorId: string, ip: string | null): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('categorias_usuario')
      .select('id, nome')
      .eq('id', id)
      .maybeSingle();
    if (error) throw falha('Falha ao excluir categoria', error);
    if (!data) throw new NotFoundError('Categoria', id);
    // Desvincula explicitamente (o FK também faz `set null`; aqui cobre o banco fake de testes).
    const { error: unlinkError } = await supabaseAdmin
      .from('profiles')
      .update({ categoria_id: null })
      .eq('categoria_id', id);
    if (unlinkError) throw falha('Falha ao excluir categoria', unlinkError);
    const { error: deleteError } = await supabaseAdmin
      .from('categorias_usuario')
      .delete()
      .eq('id', id);
    if (deleteError) throw falha('Falha ao excluir categoria', deleteError);
    await writeAuditLog({
      userId: actorId,
      action: 'DELETE',
      entity: 'categorias_usuario',
      entityId: id,
      changes: { nome: data.nome },
      ip,
    });
  }
}
