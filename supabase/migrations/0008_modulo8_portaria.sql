-- ============================================================================
-- Rigabras Transportes - Ecossistema Integrado de Gestao Logistica
-- Migration 0008: Módulo 8 (Portaria)
--
-- Decisões de modelagem:
--
--  1. Papel RBAC novo: 'PORTARIA' (porteiro, uso mobile-first). Estende o
--     enum `user_role` (0001) — não remove nem redefine os 4 papéis
--     existentes, apenas adiciona um quinto. RLS/rotas tratam 'PORTARIA'
--     como um papel operacional restrito às tabelas deste módulo (mesmo
--     racional de OPERADOR nos módulos 2-5), sem acesso a financeiro/seguros.
--
--  2. `portaria_entradas` é o registro de entrada do veículo na portaria.
--     `viagem_id` é OPCIONAL (nullable): a portaria deve funcionar mesmo
--     quando a viagem/CRT ainda não está cadastrada no TMS (ex: fornecedor
--     avulso, coleta não planejada) — os campos de placa/motorista/CRT são
--     denormalizados no próprio registro para nunca bloquear o porteiro.
--     Quando `viagem_id` é preenchido, a automação grava uma NOTA na linha do
--     tempo da viagem (`status_viagem_historico`, reaproveitando o padrão já
--     usado pela integração TMS+WMS na migration 0007) em vez de forçar uma
--     transição de status — preserva 100% a máquina de estados existente de
--     `viagens` (nenhuma transição nova é adicionada a `TRANSICOES_STATUS_VIAGEM`).
--
--  3. `ordens_servico`: criada automaticamente pela aplicação (não por
--     trigger SQL, mesmo padrão de orquestração cross-módulo já usado pela
--     integração TMS+WMS) quando uma entrada de portaria é do tipo
--     'DESCARGA'. É um rastreador operacional simples (setor responsável +
--     estado), não duplica o WMS (recebimentos/expedições continuam sendo a
--     fonte de verdade de estoque).
--
--  4. `portaria_documentos`: metadados dos arquivos anexados pelo porteiro
--     (foto/PDF), o binário fica no Supabase Storage (bucket privado
--     'portaria-documentos', criado abaixo). `ocr_extraido_json` é um campo
--     preparatório (critério "OCR e leitura automática de documentos" do
--     documento de evolução) — sempre nulo nesta migration, nunca lido como
--     fonte de verdade sem conferência humana (`conferido_por`/`conferido_em`).
--
--  5. `portaria_saidas`: 1:1 com `portaria_entradas` (uma entrada tem no
--     máximo uma saída), calcula `tempo_patio_minutos` na aplicação (não em
--     coluna gerada) para poder registrar o valor mesmo que o cálculo mude
--     no futuro sem precisar reprocessar linhas antigas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Papel RBAC: portaria
-- ----------------------------------------------------------------------------
alter type user_role add value if not exists 'PORTARIA';

-- ----------------------------------------------------------------------------
-- Origem de evento na timeline da viagem: nota de portaria (mesmo padrão do
-- Módulo 6 / migration 0007, que introduziu 'WMS').
-- ----------------------------------------------------------------------------
alter type origem_evento_viagem add value if not exists 'PORTARIA';

-- ----------------------------------------------------------------------------
-- ENUMs do Módulo 8
-- ----------------------------------------------------------------------------
create type tipo_operacao_portaria as enum ('DESCARGA', 'CARGA', 'TRANSITO');

create type status_portaria_entrada as enum (
  'AGUARDANDO_CONFERENCIA',
  'CONFERIDO',
  'LIBERADO_PATIO',
  'AGUARDANDO_SAIDA',
  'SAIDA_REGISTRADA',
  'CANCELADA'
);

create type tipo_documento_portaria as enum (
  'CRT',
  'ORDEM_COLETA',
  'NOTA_FISCAL',
  'CNH',
  'OUTRO'
);

create type tipo_ordem_servico as enum ('DESCARGA', 'CARGA');

create type status_ordem_servico as enum ('ABERTA', 'EM_EXECUCAO', 'FINALIZADA', 'CANCELADA');

-- ----------------------------------------------------------------------------
-- portaria_entradas
-- ----------------------------------------------------------------------------
create table portaria_entradas (
  id uuid primary key default uuid_generate_v7(),
  viagem_id uuid references viagens(id) on delete set null,
  placa_cavalo text not null,
  placa_carreta text,
  motorista_id uuid references motoristas(id) on delete set null,
  motorista_nome text not null,
  motorista_documento text,
  empresa_proprietario text,
  numero_viagem_avulso text,     -- referência livre quando não há viagem_id
  numero_crt text,
  cliente text,
  origem text,
  destino text,
  tipo_operacao tipo_operacao_portaria not null default 'DESCARGA',
  status status_portaria_entrada not null default 'AGUARDANDO_CONFERENCIA',
  observacoes text,
  data_entrada timestamptz not null default now(),
  registrado_por uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create index idx_portaria_entradas_viagem on portaria_entradas(viagem_id);
create index idx_portaria_entradas_status on portaria_entradas(status) where deleted_at is null;
create index idx_portaria_entradas_placa_cavalo on portaria_entradas(placa_cavalo);
create index idx_portaria_entradas_data_entrada on portaria_entradas(data_entrada desc);

create trigger trg_portaria_entradas_updated_at
  before update on portaria_entradas
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- portaria_documentos
-- ----------------------------------------------------------------------------
create table portaria_documentos (
  id uuid primary key default uuid_generate_v7(),
  entrada_id uuid not null references portaria_entradas(id) on delete cascade,
  tipo_documento tipo_documento_portaria not null,
  storage_path text not null,     -- caminho no bucket 'portaria-documentos'
  nome_arquivo text,
  ocr_extraido_json jsonb,        -- preparação futura p/ OCR; nunca fonte de verdade sem conferência
  conferido_por uuid references profiles(id),
  conferido_em timestamptz,
  enviado_por uuid references profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_portaria_documentos_entrada on portaria_documentos(entrada_id);

-- ----------------------------------------------------------------------------
-- portaria_saidas (1:1 com portaria_entradas)
-- ----------------------------------------------------------------------------
create table portaria_saidas (
  id uuid primary key default uuid_generate_v7(),
  entrada_id uuid not null unique references portaria_entradas(id) on delete cascade,
  data_saida timestamptz not null default now(),
  situacao_descarga text,      -- texto livre: 'FINALIZADA', 'PARCIAL', 'PENDENTE', etc.
  tempo_patio_minutos integer not null,
  observacoes text,
  registrado_por uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_portaria_saidas_entrada on portaria_saidas(entrada_id);

-- ----------------------------------------------------------------------------
-- ordens_servico (OS gerada automaticamente pela entrada de portaria)
-- ----------------------------------------------------------------------------
create table ordens_servico (
  id uuid primary key default uuid_generate_v7(),
  tipo tipo_ordem_servico not null,
  entrada_portaria_id uuid references portaria_entradas(id) on delete set null,
  viagem_id uuid references viagens(id) on delete set null,
  status status_ordem_servico not null default 'ABERTA',
  setor_responsavel text,
  observacoes text,
  created_by uuid references profiles(id),
  finalizada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create index idx_ordens_servico_entrada on ordens_servico(entrada_portaria_id);
create index idx_ordens_servico_viagem on ordens_servico(viagem_id);
create index idx_ordens_servico_status on ordens_servico(status) where deleted_at is null;

create trigger trg_ordens_servico_updated_at
  before update on ordens_servico
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Storage: bucket privado para documentos fotografados na portaria (CRT,
-- ordem de coleta, CNH, etc). Privado (não público) — critério de segurança
-- #25 do documento de evolução: imagens de documentos não ficam acessíveis
-- publicamente. Acesso via URL assinada, gerada sob demanda pela API.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('portaria-documentos', 'portaria-documentos', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table portaria_entradas enable row level security;
alter table portaria_documentos enable row level security;
alter table portaria_saidas enable row level security;
alter table ordens_servico enable row level security;

create policy portaria_entradas_select_all_roles on portaria_entradas
  for select using (
    current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE', 'PORTARIA')
  );
create policy portaria_entradas_insert_portaria_ops on portaria_entradas
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'PORTARIA'));
create policy portaria_entradas_update_portaria_ops on portaria_entradas
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'PORTARIA'));

create policy portaria_documentos_select_all_roles on portaria_documentos
  for select using (
    current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE', 'PORTARIA')
  );
create policy portaria_documentos_insert_portaria_ops on portaria_documentos
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'PORTARIA'));
create policy portaria_documentos_update_conferencia on portaria_documentos
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));

create policy portaria_saidas_select_all_roles on portaria_saidas
  for select using (
    current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE', 'PORTARIA')
  );
create policy portaria_saidas_insert_portaria_ops on portaria_saidas
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'PORTARIA'));

create policy ordens_servico_select_all_roles on ordens_servico
  for select using (
    current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE', 'PORTARIA')
  );
create policy ordens_servico_insert_operacional on ordens_servico
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'PORTARIA'));
create policy ordens_servico_update_operacional on ordens_servico
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));

-- Storage RLS: leitura/escrita do bucket restrita a usuários autenticados
-- com papel operacional (mesmo conjunto de roles das tabelas acima); o
-- caminho do objeto é sempre "<entrada_id>/<arquivo>", mas não restringimos
-- por prefixo aqui para manter simples — o controle real de quem enxerga
-- qual documento é feito pela API (URLs assinadas, nunca o bucket público).
create policy portaria_documentos_storage_select on storage.objects
  for select using (
    bucket_id = 'portaria-documentos'
    and current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE', 'PORTARIA')
  );
create policy portaria_documentos_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'portaria-documentos'
    and current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'PORTARIA')
  );

-- ============================================================================
-- Fim da migration 0008
-- ============================================================================
