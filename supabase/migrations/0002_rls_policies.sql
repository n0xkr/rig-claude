-- ============================================================================
-- Migration 0002: Row Level Security (RLS) - Módulo Gerenciamento de Risco
-- Regras: SUPERADMIN/ADMIN = full access; OPERADOR = leitura/escrita nas
-- tabelas operacionais (veiculos, motoristas, viagens, eventos_risco) mas
-- SEM acesso a apolices_seguro (financeiro/seguros); VISITANTE = somente
-- leitura em tudo que não for financeiro/seguros.
-- Helper: auth.jwt() ->> 'role' seria uma opção, mas aqui usamos a coluna
-- profiles.role (fonte da verdade), lida via função SECURITY DEFINER para
-- evitar recursão de RLS na própria tabela profiles.
-- ============================================================================

create or replace function current_user_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid() and deleted_at is null;
$$;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
alter table profiles enable row level security;

create policy profiles_select_self_or_admin on profiles
  for select using (
    id = auth.uid() or current_user_role() in ('SUPERADMIN', 'ADMIN')
  );

create policy profiles_update_self_or_admin on profiles
  for update using (
    id = auth.uid() or current_user_role() in ('SUPERADMIN', 'ADMIN')
  );

create policy profiles_insert_admin_only on profiles
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN'));

create policy profiles_delete_superadmin_only on profiles
  for delete using (current_user_role() = 'SUPERADMIN');

-- ----------------------------------------------------------------------------
-- audit_logs (somente leitura para ADMIN+; escrita feita pelo backend via
-- service-role client, que ignora RLS)
-- ----------------------------------------------------------------------------
alter table audit_logs enable row level security;

create policy audit_logs_select_admin on audit_logs
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- ----------------------------------------------------------------------------
-- veiculos / motoristas / viagens / eventos_risco: operacional
-- ----------------------------------------------------------------------------
alter table veiculos enable row level security;
alter table motoristas enable row level security;
alter table viagens enable row level security;
alter table eventos_risco enable row level security;

create policy veiculos_select_all_roles on veiculos
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy veiculos_write_admin_operador on veiculos
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy veiculos_update_admin_operador on veiculos
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy veiculos_delete_admin on veiculos
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

create policy motoristas_select_all_roles on motoristas
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy motoristas_write_admin_operador on motoristas
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy motoristas_update_admin_operador on motoristas
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy motoristas_delete_admin on motoristas
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

create policy viagens_select_all_roles on viagens
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy viagens_write_admin_operador on viagens
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy viagens_update_admin_operador on viagens
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy viagens_delete_admin on viagens
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

create policy eventos_risco_select_all_roles on eventos_risco
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy eventos_risco_write_admin_operador on eventos_risco
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy eventos_risco_update_admin_operador on eventos_risco
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy eventos_risco_delete_admin on eventos_risco
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- ----------------------------------------------------------------------------
-- apolices_seguro: dado financeiro/seguros -> OPERADOR sem acesso
-- ----------------------------------------------------------------------------
alter table apolices_seguro enable row level security;

create policy apolices_select_admin_visitante on apolices_seguro
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'VISITANTE'));
create policy apolices_write_admin on apolices_seguro
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN'));
create policy apolices_update_admin on apolices_seguro
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN'));
create policy apolices_delete_superadmin on apolices_seguro
  for delete using (current_user_role() = 'SUPERADMIN');

-- ----------------------------------------------------------------------------
-- STUB tables: RLS habilitado com política mínima (somente ADMIN+) até que os
-- módulos correspondentes sejam implementados por completo.
-- ----------------------------------------------------------------------------
alter table documentos_embarque enable row level security;
alter table eventos_fronteira enable row level security;
alter table fretes enable row level security;
alter table pagamentos_frete enable row level security;
alter table jornadas_motorista enable row level security;
alter table registros_ponto enable row level security;
alter table armazens enable row level security;
alter table estoque_itens enable row level security;
alter table movimentacoes_estoque enable row level security;

create policy stub_admin_full_documentos_embarque on documentos_embarque for all using (current_user_role() in ('SUPERADMIN','ADMIN'));
create policy stub_admin_full_eventos_fronteira on eventos_fronteira for all using (current_user_role() in ('SUPERADMIN','ADMIN'));
create policy stub_admin_full_fretes on fretes for all using (current_user_role() in ('SUPERADMIN','ADMIN'));
create policy stub_admin_full_pagamentos_frete on pagamentos_frete for all using (current_user_role() in ('SUPERADMIN','ADMIN'));
create policy stub_admin_full_jornadas_motorista on jornadas_motorista for all using (current_user_role() in ('SUPERADMIN','ADMIN'));
create policy stub_admin_full_registros_ponto on registros_ponto for all using (current_user_role() in ('SUPERADMIN','ADMIN'));
create policy stub_admin_full_armazens on armazens for all using (current_user_role() in ('SUPERADMIN','ADMIN'));
create policy stub_admin_full_estoque_itens on estoque_itens for all using (current_user_role() in ('SUPERADMIN','ADMIN'));
create policy stub_admin_full_movimentacoes_estoque on movimentacoes_estoque for all using (current_user_role() in ('SUPERADMIN','ADMIN'));
