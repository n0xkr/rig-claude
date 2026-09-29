-- ============================================================================
-- 0013 — Categorias de usuário + permissões por módulo
-- ----------------------------------------------------------------------------
-- 1. categorias_usuario: grupos criados pelo SUPERADMIN (ex.: "Financeiro",
--    "Portaria noturna") com a lista de módulos que liberam (`permissoes`,
--    chaves de MODULOS em packages/shared/src/permissoes.ts).
-- 2. profiles.categoria_id / profiles.permissoes: a lista do próprio usuário
--    (quando não nula) vence a da categoria; ambas nulas = todos os módulos
--    (comportamento anterior, governado só pelo papel). Tudo aditivo e anulável.
-- 3. Correção de segurança: a policy `profiles_update_self_or_admin` (0002)
--    deixava qualquer usuário autenticado no Supabase alterar a PRÓPRIA linha
--    inteira — inclusive `role` (escalada para SUPERADMIN com a anon key
--    pública). O trigger abaixo bloqueia a mudança de campos de controle de
--    acesso por quem não é SUPERADMIN/ADMIN. A API usa a service-role
--    (auth.uid() nulo) e continua livre; ela já aplica as mesmas regras.
-- Idempotente: pode ser executada mais de uma vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. categorias_usuario
-- ----------------------------------------------------------------------------
create table if not exists categorias_usuario (
  id uuid primary key default uuid_generate_v7(),
  nome text not null check (char_length(trim(nome)) between 2 and 80),
  descricao text,
  permissoes text[] not null default '{}',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists categorias_usuario_nome_unico
  on categorias_usuario (lower(trim(nome)));

drop trigger if exists trg_categorias_usuario_updated_at on categorias_usuario;
create trigger trg_categorias_usuario_updated_at
  before update on categorias_usuario
  for each row execute function set_updated_at();

alter table categorias_usuario enable row level security;

drop policy if exists categorias_usuario_select_admin on categorias_usuario;
create policy categorias_usuario_select_admin on categorias_usuario
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

drop policy if exists categorias_usuario_write_superadmin on categorias_usuario;
create policy categorias_usuario_write_superadmin on categorias_usuario
  for all using (current_user_role() = 'SUPERADMIN')
  with check (current_user_role() = 'SUPERADMIN');

-- ----------------------------------------------------------------------------
-- 2. profiles
-- ----------------------------------------------------------------------------
alter table profiles
  add column if not exists categoria_id uuid references categorias_usuario(id) on delete set null,
  add column if not exists permissoes text[];

create index if not exists profiles_categoria_id_idx on profiles (categoria_id);

-- ----------------------------------------------------------------------------
-- 3. Campos de controle de acesso só mudam por admin (ou pela API/service-role)
-- ----------------------------------------------------------------------------
create or replace function proteger_campos_acesso_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or current_user_role() in ('SUPERADMIN', 'ADMIN') then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.ativo is distinct from old.ativo
     or new.email is distinct from old.email
     or new.deleted_at is distinct from old.deleted_at
     or new.categoria_id is distinct from old.categoria_id
     or new.permissoes is distinct from old.permissoes then
    raise exception 'Somente administradores podem alterar papel, status, categoria ou permissões'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_proteger_campos_acesso on profiles;
create trigger trg_profiles_proteger_campos_acesso
  before update on profiles
  for each row execute function proteger_campos_acesso_profile();

-- Recarrega o cache de schema do PostgREST (novas tabela/colunas visíveis na hora).
notify pgrst, 'reload schema';
