-- ============================================================================
-- Migration 0016: endurecimento de acesso (auditoria PROMPT_APRIMORADOR.md, P1-2 e P1-3)
--
--  * current_user_role() passa a ignorar usuários desativados (ativo = false):
--    antes, um usuário desativado continuava com acesso via RLS/Storage direto
--    (anon key + JWT do Supabase) enquanto a sessão fosse válida.
--  * Somente SUPERADMIN (ou a API, via service-role, onde auth.uid() é nulo)
--    altera papel, status, e-mail, categoria, permissões ou exclusão lógica de
--    perfis. Antes, um ADMIN podia se promover a SUPERADMIN via PostgREST direto.
--
-- Idempotente e sem alteração de dados. Aplicar manualmente (SQL Editor do
-- Supabase), como as demais migrations. A API (service-role) não é afetada.
-- ============================================================================

create or replace function current_user_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles
  where id = auth.uid() and deleted_at is null and ativo is not false;
$$;

create or replace function proteger_campos_acesso_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or current_user_role() = 'SUPERADMIN' then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.ativo is distinct from old.ativo
     or new.email is distinct from old.email
     or new.deleted_at is distinct from old.deleted_at
     or new.categoria_id is distinct from old.categoria_id
     or new.permissoes is distinct from old.permissoes then
    raise exception 'Somente o SUPERADMIN pode alterar papel, status, categoria ou permissões'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Índices das FKs de autoria (evitam varredura completa ao excluir perfis).
create index if not exists idx_viagens_created_by on viagens (created_by);
create index if not exists idx_portaria_entradas_registrado_por on portaria_entradas (registrado_por);

notify pgrst, 'reload schema';
