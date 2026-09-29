-- ============================================================================
-- 0014 — Viagens: fluxo operacional real, cargas (CRT/DANFE), carreta,
--        checagens GR e histórico de troca de motorista
-- ----------------------------------------------------------------------------
-- 1. status_viagem ganha as etapas do fluxo real da operação (trânsito para o
--    cliente -> carregamento -> fronteira -> aduanas Multilog/Cotecar ->
--    aduana de destino -> cliente -> retorno vazio -> fim). Os valores antigos
--    ficam no enum (o Postgres não remove valores) e as viagens que ainda
--    estavam neles são convertidas para a etapa equivalente.
-- 2. viagens: codigo_externo (ID da viagem na planilha, chave da
--    reimportação), placa_carreta/placa_carreta_2, cliente, mercadoria,
--    tipo_mercadoria, valor_mercadoria, pesquisa_ok/checklist_ok/smp_ok e
--    dados_extras (colunas da planilha sem campo próprio).
-- 3. viagem_cargas: vários CRT/DANFE por viagem, cada um com mercadoria,
--    tipo, peso e valor.
-- 4. viagem_motorista_historico: quem era o motorista, quem ficou, quando e
--    por qual motivo.
-- 5. motoristas: RG, data de nascimento, filiação e 1ª habilitação (lidos da
--    CNH por OCR ou digitados); motorista_documentos + bucket privado
--    'motoristas-documentos' para CNH e CRLV do cavalo/carreta.
-- Idempotente e seguro para colar INTEIRO de uma vez no SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1a. Novos valores do enum — em transação própria: o Postgres proíbe usar um
--     valor de enum recém-criado na mesma transação (erro 55P04), e o UPDATE
--     do passo 1b usa esses valores.
-- ----------------------------------------------------------------------------
begin;
alter type status_viagem add value if not exists 'EM_TRANSITO_CLIENTE';
alter type status_viagem add value if not exists 'NO_CLIENTE_AGUARDANDO_CARREGAMENTO';
alter type status_viagem add value if not exists 'CARREGADO_AGUARDANDO_DOCUMENTOS';
alter type status_viagem add value if not exists 'EM_TRANSITO_FRONTEIRA';
alter type status_viagem add value if not exists 'NA_FRONTEIRA_AGUARDANDO_CRUZE';
alter type status_viagem add value if not exists 'PROGRAMADO_CARREGAR';
alter type status_viagem add value if not exists 'CARREGADO';
alter type status_viagem add value if not exists 'ENTRADA_ADUANA_MULTILOG';
alter type status_viagem add value if not exists 'SAIDA_ADUANA_MULTILOG';
alter type status_viagem add value if not exists 'ENTRADA_ADUANA_COTECAR';
alter type status_viagem add value if not exists 'SAIDA_ADUANA_COTECAR';
alter type status_viagem add value if not exists 'CHEGADA_ADUANA_DESTINO';
alter type status_viagem add value if not exists 'SAIDA_ADUANA_DESTINO';
alter type status_viagem add value if not exists 'CHEGADA_CLIENTE';
alter type status_viagem add value if not exists 'VAZIO_NO_CLIENTE';
alter type status_viagem add value if not exists 'SAIDA_CLIENTE';
alter type status_viagem add value if not exists 'RETORNANDO_VAZIO';
commit;

-- ----------------------------------------------------------------------------
-- 1b. Viagens paradas em status antigos -> etapa equivalente do fluxo novo
-- ----------------------------------------------------------------------------
update viagens set status = case status::text
    when 'AGUARDANDO_COLETA' then 'EM_TRANSITO_CLIENTE'
    when 'EM_COLETA' then 'NO_CLIENTE_AGUARDANDO_CARREGAMENTO'
    when 'EM_DOCUMENTACAO' then 'CARREGADO_AGUARDANDO_DOCUMENTOS'
    when 'VEICULO_MOTORISTA_DEFINIDO' then 'CARREGADO_AGUARDANDO_DOCUMENTOS'
    when 'EM_VALIDACAO_PRE_EMBARQUE' then 'CARREGADO_AGUARDANDO_DOCUMENTOS'
    when 'EM_TRANSITO' then 'EM_TRANSITO_FRONTEIRA'
    when 'EM_MONITORAMENTO' then 'SAIDA_ADUANA_DESTINO'
    when 'ENTREGUE' then 'VAZIO_NO_CLIENTE'
  end::status_viagem
where status::text in ('AGUARDANDO_COLETA', 'EM_COLETA', 'EM_DOCUMENTACAO',
  'VEICULO_MOTORISTA_DEFINIDO', 'EM_VALIDACAO_PRE_EMBARQUE', 'EM_TRANSITO',
  'EM_MONITORAMENTO', 'ENTREGUE');

-- ----------------------------------------------------------------------------
-- 2. Novas colunas de viagens
-- ----------------------------------------------------------------------------
alter table viagens
  add column if not exists codigo_externo text,
  add column if not exists placa_carreta text,
  add column if not exists placa_carreta_2 text,
  add column if not exists cliente text,
  add column if not exists mercadoria text,
  add column if not exists tipo_mercadoria text,
  add column if not exists valor_mercadoria numeric(14,2),
  add column if not exists pesquisa_ok boolean not null default false,
  add column if not exists checklist_ok boolean not null default false,
  add column if not exists smp_ok boolean not null default false,
  add column if not exists dados_extras jsonb;

create unique index if not exists viagens_codigo_externo_unico
  on viagens (codigo_externo) where deleted_at is null and codigo_externo is not null;
create index if not exists idx_viagens_placa_carreta on viagens (placa_carreta);

comment on column viagens.codigo_externo is 'ID da viagem na planilha de origem (ex.: RGB-2026-0412). Reimportar a mesma planilha atualiza em vez de duplicar.';
comment on column viagens.numero_crt is 'Documento principal da viagem (primeiro CRT/DANFE). Todos os documentos ficam em viagem_cargas.';
comment on column viagens.data_programacao is 'Data/hora prevista de início. No futuro com status PROGRAMADA = viagem agendada.';

-- ----------------------------------------------------------------------------
-- 3. viagem_cargas: CRT/DANFE da viagem
-- ----------------------------------------------------------------------------
create table if not exists viagem_cargas (
  id uuid primary key default uuid_generate_v7(),
  viagem_id uuid not null references viagens(id) on delete cascade,
  tipo_documento text not null default 'CRT' check (tipo_documento in ('CRT', 'DANFE', 'OUTRO')),
  numero_documento text not null check (char_length(trim(numero_documento)) > 0),
  mercadoria text,
  tipo_mercadoria text,
  peso_kg numeric(12,2) check (peso_kg is null or peso_kg >= 0),
  valor_mercadoria numeric(14,2) check (valor_mercadoria is null or valor_mercadoria >= 0),
  moeda text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_viagem_cargas_viagem on viagem_cargas (viagem_id);
create index if not exists idx_viagem_cargas_documento on viagem_cargas (numero_documento);

drop trigger if exists trg_viagem_cargas_updated_at on viagem_cargas;
create trigger trg_viagem_cargas_updated_at
  before update on viagem_cargas
  for each row execute function set_updated_at();

alter table viagem_cargas enable row level security;
drop policy if exists viagem_cargas_select_all_roles on viagem_cargas;
create policy viagem_cargas_select_all_roles on viagem_cargas
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
drop policy if exists viagem_cargas_write_admin_operador on viagem_cargas;
create policy viagem_cargas_write_admin_operador on viagem_cargas
  for all using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'))
  with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));

-- Viagens que já tinham CRT viram a primeira carga.
insert into viagem_cargas (viagem_id, tipo_documento, numero_documento, peso_kg)
select v.id, 'CRT', v.numero_crt, v.peso_kg
from viagens v
where v.numero_crt is not null and trim(v.numero_crt) <> ''
  and not exists (select 1 from viagem_cargas c where c.viagem_id = v.id);

-- ----------------------------------------------------------------------------
-- 4. viagem_motorista_historico
-- ----------------------------------------------------------------------------
create table if not exists viagem_motorista_historico (
  id uuid primary key default uuid_generate_v7(),
  viagem_id uuid not null references viagens(id) on delete cascade,
  motorista_anterior_id uuid references motoristas(id) on delete set null,
  motorista_novo_id uuid references motoristas(id) on delete set null,
  motivo text,
  changed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_viagem_motorista_historico_viagem
  on viagem_motorista_historico (viagem_id, created_at);

alter table viagem_motorista_historico enable row level security;
drop policy if exists viagem_motorista_historico_select_all_roles on viagem_motorista_historico;
create policy viagem_motorista_historico_select_all_roles on viagem_motorista_historico
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
drop policy if exists viagem_motorista_historico_insert_admin_operador on viagem_motorista_historico;
create policy viagem_motorista_historico_insert_admin_operador on viagem_motorista_historico
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));

-- Motorista atual de cada viagem vira o "primeiro motorista" do histórico.
insert into viagem_motorista_historico (viagem_id, motorista_anterior_id, motorista_novo_id, motivo, created_at)
select v.id, null, v.motorista_id, 'Motorista inicial', v.created_at
from viagens v
where v.motorista_id is not null
  and not exists (select 1 from viagem_motorista_historico h where h.viagem_id = v.id);

-- ----------------------------------------------------------------------------
-- 5. Motoristas: dados da CNH e documentos anexados
-- ----------------------------------------------------------------------------
alter table motoristas
  add column if not exists rg text,
  add column if not exists data_nascimento date,
  add column if not exists nome_mae text,
  add column if not exists nome_pai text,
  add column if not exists cnh_primeira_habilitacao date;

create table if not exists motorista_documentos (
  id uuid primary key default uuid_generate_v7(),
  motorista_id uuid not null references motoristas(id) on delete cascade,
  tipo text not null check (tipo in ('CNH', 'CRLV_CAVALO', 'CRLV_CARRETA', 'CRLV_CARRETA_2', 'OUTRO')),
  placa text,
  nome_arquivo text not null,
  mime_type text not null,
  tamanho_bytes integer,
  storage_path text not null,
  ocr_dados jsonb,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_motorista_documentos_motorista on motorista_documentos (motorista_id, tipo);

alter table motorista_documentos enable row level security;
drop policy if exists motorista_documentos_select on motorista_documentos;
create policy motorista_documentos_select on motorista_documentos
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
drop policy if exists motorista_documentos_write on motorista_documentos;
create policy motorista_documentos_write on motorista_documentos
  for all using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'))
  with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));

-- Bucket privado: os arquivos só são abertos por URL assinada gerada pela API.
insert into storage.buckets (id, name, public)
values ('motoristas-documentos', 'motoristas-documentos', false)
on conflict (id) do nothing;

-- Recarrega o cache de schema do PostgREST (novas tabelas/colunas visíveis na hora).
notify pgrst, 'reload schema';
