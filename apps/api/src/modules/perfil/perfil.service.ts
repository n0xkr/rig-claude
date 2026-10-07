import type { Perfil, UpdatePerfilInput } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { DomainError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';
import { env } from '../../config/env.js';

/** Mesmas duas travas da rota de Auditoria: e-mail autorizado E papel administrativo. */
const podeVerAuditoria = (email: string, role: string): boolean =>
  (role === 'SUPERADMIN' || role === 'ADMIN') &&
  env.AUDITORIA_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());

const COLUMNS =
  'id, email, role, nome_completo, avatar_url, funcao, atribuicoes, telefone, departamento, bio, created_at';

/**
 * Painel do usuário: cada pessoa lê e edita SEU PRÓPRIO cadastro. O id vem sempre
 * do token (nunca do corpo/URL) e `email`/`role`/`ativo` não são editáveis aqui —
 * o schema de entrada (`UpdatePerfilSchema`) é `strict`, então qualquer outro
 * campo é rejeitado antes de chegar ao banco.
 */
export class PerfilService {
  async obter(userId: string): Promise<Perfil> {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select(COLUMNS)
      .eq('id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new DomainError('Falha ao carregar o perfil', 500, error.message);
    if (!data) throw new NotFoundError('Perfil', userId);
    const perfil = data as Perfil;
    return { ...perfil, pode_ver_auditoria: podeVerAuditoria(perfil.email, perfil.role) };
  }

  async atualizar(userId: string, patch: UpdatePerfilInput, ip: string | null): Promise<Perfil> {
    if (Object.keys(patch).length === 0) return this.obter(userId);
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .is('deleted_at', null)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw new DomainError('Falha ao atualizar o perfil', 500, error.message);
    if (!data) throw new NotFoundError('Perfil', userId);
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'perfil',
      entityId: userId,
      // A foto (data URL) é grande demais para a trilha: registra só que mudou.
      changes: {
        campos: Object.keys(patch),
        ...(patch.avatar_url !== undefined
          ? { avatar: patch.avatar_url === null ? 'removida' : 'alterada' }
          : {}),
      },
      ip,
    });
    const perfil = data as Perfil;
    return { ...perfil, pode_ver_auditoria: podeVerAuditoria(perfil.email, perfil.role) };
  }
}
