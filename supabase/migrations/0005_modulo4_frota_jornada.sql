-- ============================================================================
-- Rigabras Transportes - Ecossistema Integrado de Gestao Logistica
-- Migration 0005: Módulo 4 (Controle de Frota e Jornada)
--  - manutencoes_veiculo: nova tabela (não existia stub) para o histórico de
--    manutenção da frota (critério "Gestão de Ativos"): tipo, data, custo,
--    km do veículo no momento e a previsão da próxima manutenção
--    (data e/ou km).
--  - viagens: ganha 3 colunas próprias do Módulo 4 (km_rodado, km_vazio,
--    consumo_combustivel_litros), preenchidas por um endpoint dedicado deste
--    módulo (`PATCH /api/v1/frota/viagens/:viagemId/quilometragem`) — nenhum
--    arquivo do Módulo 2 (`viagens.controller/service/repository/routes`) é
--    alterado por esta migration ou pelo módulo novo. Decisão de modelagem
--    para "km vazio" (critério "Quilometragem"): em vez de duplicar o sinal
--    booleano `fretes.retorno_vazio` (Módulo 3) aqui, os indicadores de frota
--    fazem JOIN entre `viagens` e `fretes` para cruzar os dois sinais
--    (km_vazio numérico, medido/estimado a partir do hodômetro — ainda não há
--    integração Autotrac — e o percentual de viagens com retorno vazio,
--    lido de `fretes.retorno_vazio`), nunca reescrevendo o dado do Módulo 3.
--  - registros_jornada: substitui os DOIS stubs da migration 0001
--    (`jornadas_motorista` e `registros_ponto`) por uma ÚNICA tabela de log
--    contínuo de eventos de jornada (crítico para a ADI 5322): início de
--    jornada, início/fim de direção, início/fim de espera, início/fim de
--    descanso, fim de jornada — cada evento é uma linha imutável timestampada
--    (nunca um registro agregado por sessão como `jornadas_motorista`, nem um
--    "ponto" genérico desvinculado de viagem como `registros_ponto`).
--    Consolidar em uma tabela evita duplicar a mesma linha do tempo em dois
--    lugares e permite ao serviço de conformidade iterar sequencialmente por
--    TODOS os eventos de um motorista para computar tempo de jornada, tempo
--    de direção, tempo de espera (que CONTA como jornada — STF ADI 5322) e
--    tempo de descanso (mínimo de 11h, não fracionável).
--  - RLS: manutencoes_veiculo segue o padrão operacional de veiculos
--    (OPERADOR lê/escreve, sem acesso a exclusão). registros_jornada é
--    INSERT-ONLY para OPERADOR (loga eventos em tempo real, inclusive para
--    reduzir passivo trabalhista — critério do Módulo 4), mas SEM UPDATE
--    (o registro é imutável por design: uma correção é feita por um novo
--    evento compensatório, nunca editando um evento já lançado, preservando a
--    integridade probatória do histórico); a exclusão (para erros de
--    lançamento genuínos) fica restrita a SUPERADMIN, no mesmo padrão mais
--    restritivo usado para pagamentos de frete (dado sensível/probatório).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMs do Módulo 4
-- ----------------------------------------------------------------------------
create type tipo_manutencao_veiculo as enum (
  'PREVENTIVA',
  'CORRETIVA',
  'REVISAO',
  'TROCA_PNEUS',
  'OUTRO'
);

create type tipo_evento_jornada as enum (
  'INICIO_JORNADA',
  'INICIO_DIRECAO',
  'FIM_DIRECAO',
  'INICIO_ESPERA',
  'FIM_ESPERA',
  'INICIO_DESCANSO',
  'FIM_DESCANSO',
  'FIM_JORNADA'
);

-- ----------------------------------------------------------------------------
-- manutencoes_veiculo
-- ----------------------------------------------------------------------------
create table manutencoes_veiculo (
  id uuid primary key default uuid_generate_v7(),
  veiculo_id uuid not null references veiculos(id) on delete cascade,
  tipo tipo_manutencao_veiculo not null,
  data_manutencao date not null default current_date,
  km_veiculo numeric(10,2),
  custo numeric(12,2) not null,
  descricao text,
  proxima_manutencao_data date,
  proxima_manutencao_km numeric(10,2),
  observacoes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint chk_manutencoes_veiculo_custo check (custo >= 0),
  constraint chk_manutencoes_veiculo_km_veiculo check (km_veiculo is null or km_veiculo >= 0),
  constraint chk_manutencoes_veiculo_proxima_km check (proxima_manutencao_km is null or proxima_manutencao_km >= 0)
);

create index idx_manutencoes_veiculo_veiculo on manutencoes_veiculo(veiculo_id) where deleted_at is null;
create index idx_manutencoes_veiculo_data on manutencoes_veiculo(data_manutencao desc);
create index idx_manutencoes_veiculo_tipo on manutencoes_veiculo(tipo);
create index idx_manutencoes_veiculo_proxima_data on manutencoes_veiculo(proxima_manutencao_data)
  where deleted_at is null and proxima_manutencao_data is not null;

create trigger trg_manutencoes_veiculo_updated_at
  before update on manutencoes_veiculo
  for each row execute function set_updated_at();

alter table manutencoes_veiculo enable row level security;

create policy manutencoes_veiculo_select_all_roles on manutencoes_veiculo
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy manutencoes_veiculo_write_admin_operador on manutencoes_veiculo
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy manutencoes_veiculo_update_admin_operador on manutencoes_veiculo
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy manutencoes_veiculo_delete_admin on manutencoes_veiculo
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- ----------------------------------------------------------------------------
-- viagens: colunas de quilometragem/consumo próprias do Módulo 4 (ver nota de
-- modelagem no cabeçalho desta migration). Nenhuma coluna do Módulo 2 é
-- alterada; apenas adicionamos 3 colunas novas, opcionais.
-- ----------------------------------------------------------------------------
alter table viagens
  add column if not exists km_rodado numeric(10,2),
  add column if not exists km_vazio numeric(10,2),
  add column if not exists consumo_combustivel_litros numeric(10,2);

alter table viagens
  add constraint chk_viagens_km_rodado check (km_rodado is null or km_rodado >= 0),
  add constraint chk_viagens_km_vazio check (km_vazio is null or km_vazio >= 0),
  add constraint chk_viagens_consumo check (consumo_combustivel_litros is null or consumo_combustivel_litros >= 0);

comment on column viagens.km_rodado is 'Módulo 4 (Controle de Frota): km total rodado nesta viagem. Preenchido via PATCH /api/v1/frota/viagens/:viagemId/quilometragem, nunca pelo módulo de viagens.';
comment on column viagens.km_vazio is 'Módulo 4 (Controle de Frota): km rodado sem carga nesta viagem (hoje registrado manualmente a partir do hodômetro; integração Autotrac é trabalho futuro). Cruzado, nunca duplicado, com fretes.retorno_vazio (Módulo 3) nos KPIs agregados de frota.';
comment on column viagens.consumo_combustivel_litros is 'Módulo 4 (Controle de Frota): litros de combustível consumidos nesta viagem, usado no cálculo de consumo médio (km/l) da frota.';

-- ----------------------------------------------------------------------------
-- registros_jornada: log contínuo e imutável de eventos de jornada do
-- motorista (ver nota de modelagem no cabeçalho desta migration). Substitui
-- os stubs jornadas_motorista e registros_ponto (migration 0001).
-- ----------------------------------------------------------------------------
drop table if exists jornadas_motorista;
drop table if exists registros_ponto;

create table registros_jornada (
  id uuid primary key default uuid_generate_v7(),
  motorista_id uuid not null references motoristas(id) on delete cascade,
  viagem_id uuid references viagens(id) on delete set null,
  tipo_evento tipo_evento_jornada not null,
  timestamp_evento timestamptz not null default now(),
  latitude numeric(9,6),
  longitude numeric(9,6),
  observacoes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_registros_jornada_motorista on registros_jornada(motorista_id, timestamp_evento) where deleted_at is null;
create index idx_registros_jornada_viagem on registros_jornada(viagem_id) where deleted_at is null;
create index idx_registros_jornada_tipo_evento on registros_jornada(tipo_evento);
create index idx_registros_jornada_timestamp on registros_jornada(timestamp_evento desc);

alter table registros_jornada enable row level security;

create policy registros_jornada_select_all_roles on registros_jornada
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
-- Insert-only para OPERADOR (loga eventos em tempo real); sem policy de UPDATE
-- para nenhum papel além de ADMIN/SUPERADMIN — o registro é imutável por
-- design (ver nota de modelagem no cabeçalho).
create policy registros_jornada_write_admin_operador on registros_jornada
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy registros_jornada_update_admin on registros_jornada
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN'));
create policy registros_jornada_delete_superadmin on registros_jornada
  for delete using (current_user_role() = 'SUPERADMIN');

-- ============================================================================
-- Fim da migration 0005
-- ============================================================================
