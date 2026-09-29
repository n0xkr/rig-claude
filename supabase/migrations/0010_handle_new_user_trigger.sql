-- ============================================================================
-- 0010 — Trigger handle_new_user (documenta o que já existe no projeto Supabase)
-- ----------------------------------------------------------------------------
-- Ao inserir em auth.users, cria automaticamente o profile básico (VISITANTE).
-- A API (auth.register / usuarios.create) faz UPSERT por id em cima desse
-- profile para gravar nome, papel e status escolhidos — por isso NÃO usa INSERT
-- (que violaria a PK). Idempotente: seguro rodar em bancos que já o possuem.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, email, nome_completo)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'nome_completo', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
