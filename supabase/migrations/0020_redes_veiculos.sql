-- ============================================================================
-- 0020 — CORREÇÕES 0.5: painel de "Redes dos veículos" do WMS (Módulo 5).
--         Cadastro de rede (código RED-###### gerado no servidor), condição
--         de uso, validade, marcação "padrão cliente", status (pátio x
--         trânsito) e histórico de retiradas/devoluções.
-- Idempotente (seguro rodar mais de uma vez). Pré-requisitos: 0006 → 0019.
-- REQUER VALIDAÇÃO EXTERNA: criada sem Docker/Postgres local — revisar no
-- SQL editor do Supabase (validação de sintaxe + dry-run) antes/depois de aplicar.
-- RBAC: mesmo padrão do Módulo 5 (migration 0006) — leitura para todos os
-- papéis autenticados, escrita operacional para OPERADOR+, exclusão ADMIN+.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUMs das redes
-- ----------------------------------------------------------------------------
create type condicao_uso_rede as enum ('NOVA', 'BOA', 'REGULAR', 'RUIM');
create type status_rede as enum ('DISPONIVEL', 'EM_TRANSITO');
create type tipo_movimentacao_rede as enum ('RETIRADA', 'DEVOLUCAO');

-- ----------------------------------------------------------------------------
-- 2. redes — cadastro com código sequencial RED-###### (server-generated)
-- ----------------------------------------------------------------------------
create table if not exists redes (
  id uuid primary key default uuid_generate_v7(),
  codigo text not null,
  condicao_uso condicao_uso_rede not null default 'BOA',
  validade date,
  padrao_cliente boolean not null default false,
  status status_rede not null default 'DISPONIVEL',
  veiculo_id uuid references veiculos(id) on delete set null,
  observacoes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint chk_redes_transito_veiculo
    check (status = 'DISPONIVEL' or veiculo_id is not null)
);

create unique index if not exists idx_redes_codigo
  on redes(codigo) where deleted_at is null;
create index if not exists idx_redes_status on redes(status) where deleted_at is null;
create index if not exists idx_redes_condicao on redes(condicao_uso) where deleted_at is null;
create index if not exists idx_redes_validade
  on redes(validade) where deleted_at is null and validade is not null;

drop trigger if exists trg_redes_updated_at on redes;
create trigger trg_redes_updated_at
  before update on redes
  for each row execute function set_updated_at();

alter table redes enable row level security;
drop policy if exists redes_select_all_roles on redes;
create policy redes_select_all_roles on redes
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
drop policy if exists redes_write_admin_operador on redes;
create policy redes_write_admin_operador on redes
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
drop policy if exists redes_update_admin_operador on redes;
create policy redes_update_admin_operador on redes
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
drop policy if exists redes_delete_admin on redes;
create policy redes_delete_admin on redes
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- ----------------------------------------------------------------------------
-- 3. rede_movimentacoes — histórico de retiradas/devoluções (relatório em
--    tempo real combina `redes` + esta tabela; sem update: é append-only).
-- ----------------------------------------------------------------------------
create table if not exists rede_movimentacoes (
  id uuid primary key default uuid_generate_v7(),
  rede_id uuid not null references redes(id) on delete cascade,
  tipo tipo_movimentacao_rede not null,
  veiculo_id uuid references veiculos(id) on delete set null,
  cliente text not null,
  motorista_id uuid references motoristas(id) on delete set null,
  observacoes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  constraint chk_rede_movimentacoes_cliente check (length(trim(cliente)) > 0)
);

create index if not exists idx_rede_movimentacoes_rede
  on rede_movimentacoes(rede_id, created_at desc);
create index if not exists idx_rede_movimentacoes_tipo
  on rede_movimentacoes(tipo, created_at desc);

alter table rede_movimentacoes enable row level security;
drop policy if exists rede_movimentacoes_select_all_roles on rede_movimentacoes;
create policy rede_movimentacoes_select_all_roles on rede_movimentacoes
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
drop policy if exists rede_movimentacoes_write_admin_operador on rede_movimentacoes;
create policy rede_movimentacoes_write_admin_operador on rede_movimentacoes
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
drop policy if exists rede_movimentacoes_delete_admin on rede_movimentacoes;
create policy rede_movimentacoes_delete_admin on rede_movimentacoes
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));
