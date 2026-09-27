-- ============================================================================
-- Rigabras Transportes - Ecossistema Integrado de Gestao Logistica
-- Migration 0003: Módulo 2 (TMS Operacional)
--  - status_viagem_historico: trilha de auditoria da máquina de estados da
--    viagem (critério #1).
--  - eventos_fronteira: promovido de stub para tabela operacional completa,
--    com enum de etapa e coluna de retrabalho documental (critério #2).
--  - documentos_embarque: promovido de stub para tabela operacional completa,
--    com enum de tipo de documento, usado pela validação pré-embarque
--    (critério #3).
--  - RLS: políticas operacionais (mesmo padrão de viagens/eventos_risco)
--    substituindo as políticas "stub_admin_full" das migrations anteriores.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- status_viagem: adiciona as novas etapas granulares do Módulo 2 ao enum
-- criado na migration 0001 (não é possível alterar um enum já commitado,
-- apenas estendê-lo via ALTER TYPE ... ADD VALUE). Cada ALTER TYPE roda como
-- statement isolado (este arquivo não é executado dentro de um único BEGIN),
-- o que evita a restrição do Postgres de usar o valor na mesma transação em
-- que foi criado.
-- ----------------------------------------------------------------------------
alter type status_viagem add value if not exists 'AGUARDANDO_COLETA' after 'PROGRAMADA';
alter type status_viagem add value if not exists 'EM_DOCUMENTACAO' after 'EM_COLETA';
alter type status_viagem add value if not exists 'VEICULO_MOTORISTA_DEFINIDO' after 'EM_DOCUMENTACAO';
alter type status_viagem add value if not exists 'EM_VALIDACAO_PRE_EMBARQUE' after 'VEICULO_MOTORISTA_DEFINIDO';
alter type status_viagem add value if not exists 'EM_MONITORAMENTO' after 'NA_FRONTEIRA';

-- ----------------------------------------------------------------------------
-- ENUMs do Módulo 2
-- ----------------------------------------------------------------------------
create type etapa_fronteira as enum (
  'AGENDAMENTO',
  'CHEGADA',
  'GATE',
  'FISCALIZACAO',
  'DESEMBARACO',
  'SAIDA',
  'LIBERACAO'
);

create type tipo_documento_embarque as enum ('CRT', 'MIC_DTA', 'FATURA', 'DU_E', 'DUIMP');

-- ----------------------------------------------------------------------------
-- status_viagem_historico
-- ----------------------------------------------------------------------------
create table status_viagem_historico (
  id uuid primary key default uuid_generate_v7(),
  viagem_id uuid not null references viagens(id) on delete cascade,
  status_anterior status_viagem,
  status_novo status_viagem not null,
  changed_by uuid references profiles(id),
  observacoes text,
  created_at timestamptz not null default now()
);

create index idx_status_viagem_historico_viagem on status_viagem_historico(viagem_id);
create index idx_status_viagem_historico_created_at on status_viagem_historico(created_at desc);

alter table status_viagem_historico enable row level security;

create policy status_viagem_historico_select_all_roles on status_viagem_historico
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy status_viagem_historico_insert_admin_operador on status_viagem_historico
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));

-- ----------------------------------------------------------------------------
-- eventos_fronteira: migra de "etapa text" para enum + novas colunas
-- ----------------------------------------------------------------------------
drop policy if exists stub_admin_full_eventos_fronteira on eventos_fronteira;

alter table eventos_fronteira
  alter column etapa type etapa_fronteira using etapa::etapa_fronteira;

alter table eventos_fronteira
  add column if not exists retrabalho_documental boolean not null default false,
  add column if not exists observacoes text,
  add column if not exists created_by uuid references profiles(id);

create index if not exists idx_eventos_fronteira_etapa on eventos_fronteira(etapa);

create policy eventos_fronteira_select_all_roles on eventos_fronteira
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy eventos_fronteira_write_admin_operador on eventos_fronteira
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy eventos_fronteira_update_admin_operador on eventos_fronteira
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy eventos_fronteira_delete_admin on eventos_fronteira
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- ----------------------------------------------------------------------------
-- documentos_embarque: migra de "tipo_documento text" para enum
-- ----------------------------------------------------------------------------
drop policy if exists stub_admin_full_documentos_embarque on documentos_embarque;

alter table documentos_embarque
  alter column tipo_documento type tipo_documento_embarque using tipo_documento::tipo_documento_embarque;

alter table documentos_embarque
  add column if not exists updated_at timestamptz;

create index if not exists idx_documentos_embarque_tipo on documentos_embarque(tipo_documento);

create trigger trg_documentos_embarque_updated_at
  before update on documentos_embarque
  for each row execute function set_updated_at();

create policy documentos_embarque_select_all_roles on documentos_embarque
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy documentos_embarque_write_admin_operador on documentos_embarque
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy documentos_embarque_update_admin_operador on documentos_embarque
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy documentos_embarque_delete_admin on documentos_embarque
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- ============================================================================
-- Fim da migration 0003
-- ============================================================================
