-- ============================================================================
-- Rigabras Transportes - Ecossistema Integrado de Gestao Logistica
-- Migration 0001: schema inicial - Modulo 1 (Gerenciamento de Risco) + stubs
-- ============================================================================
-- Convenções:
--  - Todas as tabelas usam PK "id uuid".
--  - Producao recomendada: extensao pg_uuidv7 (https://github.com/fboulnois/pg_uuidv7)
--    para UUIDs ordenaveis por tempo (criterio #3 dos 17 criterios). Como este
--    scaffold nao provisiona extensoes em um projeto Supabase real, criamos uma
--    função uuid_generate_v7() em PL/pgSQL que aproxima o layout UUIDv7
--    (48 bits de timestamp em ms + versao 7 + random) usando apenas gen_random_uuid()
--    e funções built-in do pgcrypto/pgcore. Ao migrar para producao, troque o
--    "DEFAULT uuid_generate_v7()" por "DEFAULT uuid_generate_v7()" vindo da extensao
--    pg_uuidv7 (mesma assinatura), sem necessidade de alterar as tabelas.
--  - created_at/updated_at/deleted_at (soft delete) em todas as tabelas.
--  - Indices B-Tree em FKs e colunas de filtro frequente.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Função utilitária: uuid_generate_v7()
-- Gera um UUID compativel com o layout v7 (time-ordered) usando gen_random_uuid()
-- como fonte de aleatoriedade e sobrescrevendo os primeiros 48 bits com o
-- timestamp Unix em milissegundos. Upgrade de producao: extensao pg_uuidv7.
-- ----------------------------------------------------------------------------
create or replace function uuid_generate_v7()
returns uuid
language plpgsql
volatile
as $$
declare
  unix_ts_ms bytea;
  rand_bytes bytea;
  result uuid;
begin
  unix_ts_ms := substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3 for 6);
  rand_bytes := gen_random_bytes(10);
  -- version 7 (0111) nos 4 bits altos do 7º byte, variant (10xx) no 9º byte
  rand_bytes := set_byte(rand_bytes, 0, (get_byte(rand_bytes, 0) & 15) | 112);
  rand_bytes := set_byte(rand_bytes, 2, (get_byte(rand_bytes, 2) & 63) | 128);
  result := encode(unix_ts_ms || rand_bytes, 'hex')::uuid;
  return result;
end;
$$;

comment on function uuid_generate_v7() is
  'Aproximação de UUIDv7 (time-ordered) em PL/pgSQL puro. Upgrade de produção: extensão pg_uuidv7.';

-- ----------------------------------------------------------------------------
-- Trigger utilitária: atualiza updated_at automaticamente
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- ENUMs
-- ----------------------------------------------------------------------------
create type user_role as enum ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE');

create type status_viagem as enum (
  'PROGRAMADA',
  'EM_COLETA',
  'EM_TRANSITO',
  'NA_FRONTEIRA',
  'ENTREGUE',
  'ENCERRADA',
  'CANCELADA'
);

create type severidade_risco as enum ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

create type status_evento_risco as enum ('ABERTO', 'EM_ANALISE', 'MITIGADO', 'ENCERRADO');

create type tipo_apolice as enum ('RCTR_VI', 'RCTR_VI_C');

create type tipo_veiculo as enum ('CAVALO', 'CARRETA_ABERTA', 'CARRETA_SIDER', 'CARRETA_OUTRO');

-- ----------------------------------------------------------------------------
-- profiles: espelha auth.users do Supabase Auth, adiciona role de RBAC
-- ----------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome_completo text not null,
  email text not null unique,
  role user_role not null default 'VISITANTE',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create index idx_profiles_role on profiles(role) where deleted_at is null;

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- audit_logs: trilha de auditoria (criterio #3 e #9)
-- ----------------------------------------------------------------------------
create table audit_logs (
  id uuid primary key default uuid_generate_v7(),
  user_id uuid references profiles(id) on delete set null,
  action text not null,            -- ex: 'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE'
  entity text not null,            -- ex: 'viagens', 'veiculos'
  entity_id uuid,
  changes_json jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_entity on audit_logs(entity, entity_id);
create index idx_audit_logs_user on audit_logs(user_id);
create index idx_audit_logs_created_at on audit_logs(created_at desc);

-- ----------------------------------------------------------------------------
-- veiculos (cavalos mecanicos e carretas - frota Scania/Randon + agregados)
-- ----------------------------------------------------------------------------
create table veiculos (
  id uuid primary key default uuid_generate_v7(),
  placa text not null unique,
  tipo tipo_veiculo not null,
  marca text,                       -- ex: 'Scania', 'Randon'
  modelo text,
  ano_fabricacao smallint,
  frota_propria boolean not null default true,
  capacidade_kg numeric(10,2),
  rastreador_autotrac_id text,      -- identificador do rastreador Autotrac Prime
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create index idx_veiculos_placa on veiculos(placa) where deleted_at is null;
create index idx_veiculos_tipo on veiculos(tipo) where deleted_at is null;
create index idx_veiculos_frota_propria on veiculos(frota_propria) where deleted_at is null;

create trigger trg_veiculos_updated_at
  before update on veiculos
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- motoristas
-- ----------------------------------------------------------------------------
create table motoristas (
  id uuid primary key default uuid_generate_v7(),
  nome_completo text not null,
  cpf text unique,
  cnh text,
  cnh_categoria text,
  cnh_validade date,
  telefone text,
  frota_propria boolean not null default true, -- proprio x agregado
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create index idx_motoristas_cpf on motoristas(cpf) where deleted_at is null;
create index idx_motoristas_ativo on motoristas(ativo) where deleted_at is null;

create trigger trg_motoristas_updated_at
  before update on motoristas
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- viagens: entidade central do TMS / Gerenciamento de Risco
-- Fluxo: Programada -> Em Coleta -> Em Transito -> Na Fronteira -> Entregue -> Encerrada
-- ----------------------------------------------------------------------------
create table viagens (
  id uuid primary key default uuid_generate_v7(),
  numero_crt text unique,            -- Nº do CRT (Conhecimento/Contrato de Transporte)
  numero_mic_dta text,                -- MIC/DTA (manifesto + transito aduaneiro)
  placa_cavalo text not null references veiculos(placa) on update cascade,
  veiculo_id uuid references veiculos(id) on delete restrict,
  motorista_id uuid references motoristas(id) on delete restrict,
  status status_viagem not null default 'PROGRAMADA',
  origem text not null,
  destino text not null,
  pais_destino text,                  -- AR, UY, PY, BO, CL, PE
  data_programacao timestamptz not null default now(),
  data_ordem_coleta timestamptz,
  data_coleta timestamptz,
  data_inicio_viagem timestamptz,
  data_chegada_fronteira timestamptz,
  data_liberacao_fronteira timestamptz,
  data_entrega timestamptz,
  data_encerramento timestamptz,
  peso_kg numeric(10,2),
  valor_frete numeric(12,2),
  observacoes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create index idx_viagens_status on viagens(status) where deleted_at is null;
create index idx_viagens_placa_cavalo on viagens(placa_cavalo);
create index idx_viagens_veiculo on viagens(veiculo_id);
create index idx_viagens_motorista on viagens(motorista_id);
create index idx_viagens_numero_crt on viagens(numero_crt);
create index idx_viagens_data_programacao on viagens(data_programacao desc);

create trigger trg_viagens_updated_at
  before update on viagens
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- eventos_risco: eventos de gerenciamento de risco atrelados a uma viagem
-- ----------------------------------------------------------------------------
create table eventos_risco (
  id uuid primary key default uuid_generate_v7(),
  viagem_id uuid not null references viagens(id) on delete cascade,
  tipo text not null,                 -- ex: 'DESVIO_ROTA', 'PARADA_NAO_PROGRAMADA', 'ATRASO', 'SUSPEITA_FURTO'
  severidade severidade_risco not null default 'BAIXA',
  descricao text not null,
  status status_evento_risco not null default 'ABERTO',
  origem_deteccao text,               -- 'MANUAL', 'AUTOTRAC', 'GROQ_IA', 'GOOGLE_SHEETS_IMPORT'
  latitude numeric(9,6),
  longitude numeric(9,6),
  metadata_json jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create index idx_eventos_risco_viagem on eventos_risco(viagem_id);
create index idx_eventos_risco_status on eventos_risco(status) where deleted_at is null;
create index idx_eventos_risco_severidade on eventos_risco(severidade);
create index idx_eventos_risco_created_at on eventos_risco(created_at desc);

create trigger trg_eventos_risco_updated_at
  before update on eventos_risco
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- apolices_seguro: RCTR-VI ("Carta Azul") e RCTR-VI-C (danos a carga)
-- ----------------------------------------------------------------------------
create table apolices_seguro (
  id uuid primary key default uuid_generate_v7(),
  tipo tipo_apolice not null,
  numero_apolice text not null,
  seguradora text not null,
  veiculo_id uuid references veiculos(id) on delete set null,
  viagem_id uuid references viagens(id) on delete set null,
  valor_segurado numeric(14,2),
  vigencia_inicio date not null,
  vigencia_fim date not null,
  ativa boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint chk_apolice_vigencia check (vigencia_fim >= vigencia_inicio),
  constraint chk_apolice_vinculo check (veiculo_id is not null or viagem_id is not null)
);

create index idx_apolices_veiculo on apolices_seguro(veiculo_id);
create index idx_apolices_viagem on apolices_seguro(viagem_id);
create index idx_apolices_vigencia on apolices_seguro(vigencia_fim);
create index idx_apolices_numero on apolices_seguro(numero_apolice);

create trigger trg_apolices_updated_at
  before update on apolices_seguro
  for each row execute function set_updated_at();

-- ============================================================================
-- STUB TABLES — schema-only, escopo completo de CRUD/API/UI fica para sessões
-- futuras (ver README.md / NOTES.md de cada módulo).
-- ============================================================================

-- STUB: futuro módulo "TMS Operacional" (fronteira / documentação de embarque)
create table documentos_embarque (
  id uuid primary key default uuid_generate_v7(),
  viagem_id uuid not null references viagens(id) on delete cascade,
  tipo_documento text not null,    -- 'CRT', 'MIC_DTA', 'FATURA', 'DU_E', 'DUIMP'
  numero_documento text,
  url_arquivo text,
  validado boolean not null default false,
  validado_por uuid references profiles(id),
  validado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index idx_documentos_embarque_viagem on documentos_embarque(viagem_id);

-- STUB: futuro módulo "TMS Operacional" (KPIs de fronteira)
create table eventos_fronteira (
  id uuid primary key default uuid_generate_v7(),
  viagem_id uuid not null references viagens(id) on delete cascade,
  etapa text not null, -- 'AGENDAMENTO','CHEGADA','GATE','FISCALIZACAO','DESEMBARACO','SAIDA','LIBERACAO'
  timestamp_etapa timestamptz not null default now(),
  tempo_parado_minutos integer,
  motivo_retencao text,
  custo_estimado_espera numeric(12,2),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_eventos_fronteira_viagem on eventos_fronteira(viagem_id);

-- STUB: futuro módulo "Controle Financeiro do Frete"
create table fretes (
  id uuid primary key default uuid_generate_v7(),
  viagem_id uuid not null references viagens(id) on delete restrict,
  valor_contratado numeric(12,2) not null,
  valor_veiculo_vazio numeric(12,2),
  saldo_frete numeric(12,2),
  status_aprovacao text default 'PENDENTE', -- 'PENDENTE','APROVADO','REJEITADO'
  aprovado_por uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index idx_fretes_viagem on fretes(viagem_id);

-- STUB: futuro módulo "Controle Financeiro do Frete"
create table pagamentos_frete (
  id uuid primary key default uuid_generate_v7(),
  frete_id uuid not null references fretes(id) on delete cascade,
  valor_pago numeric(12,2) not null,
  data_pagamento date,
  forma_pagamento text,
  status text default 'PENDENTE', -- Lei 15.485/2026: pagamento em ate 30 dias uteis
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_pagamentos_frete_frete on pagamentos_frete(frete_id);

-- STUB: futuro módulo "Controle de Frota e Jornada" (foco ADI 5322)
create table jornadas_motorista (
  id uuid primary key default uuid_generate_v7(),
  motorista_id uuid not null references motoristas(id) on delete cascade,
  viagem_id uuid references viagens(id) on delete set null,
  inicio_jornada timestamptz not null,
  fim_jornada timestamptz,
  tempo_espera_minutos integer default 0, -- conta como jornada (STF ADI 5322)
  descanso_minutos integer default 0,
  alerta_excesso boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_jornadas_motorista_motorista on jornadas_motorista(motorista_id);
create index idx_jornadas_motorista_viagem on jornadas_motorista(viagem_id);

-- STUB: futuro módulo "Controle de Frota e Jornada"
create table registros_ponto (
  id uuid primary key default uuid_generate_v7(),
  motorista_id uuid not null references motoristas(id) on delete cascade,
  tipo_registro text not null, -- 'ENTRADA','SAIDA','INICIO_ESPERA','FIM_ESPERA','INICIO_DESCANSO','FIM_DESCANSO'
  timestamp_registro timestamptz not null default now(),
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now()
);
create index idx_registros_ponto_motorista on registros_ponto(motorista_id);

-- STUB: futuro módulo "WMS" (Armazém Geral - Decreto 1.102/1903)
create table armazens (
  id uuid primary key default uuid_generate_v7(),
  nome text not null,
  endereco text,
  area_m2 numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

-- STUB: futuro módulo "WMS"
create table estoque_itens (
  id uuid primary key default uuid_generate_v7(),
  armazem_id uuid not null references armazens(id) on delete restrict,
  sku text not null,
  descricao text,
  quantidade numeric(12,2) not null default 0,
  unidade_medida text default 'UN',
  localizacao text, -- endereçamento dentro do armazém
  cliente_depositante text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index idx_estoque_itens_armazem on estoque_itens(armazem_id);
create index idx_estoque_itens_sku on estoque_itens(sku);

-- STUB: futuro módulo "WMS"
create table movimentacoes_estoque (
  id uuid primary key default uuid_generate_v7(),
  item_id uuid not null references estoque_itens(id) on delete cascade,
  tipo_movimentacao text not null, -- 'ENTRADA','SAIDA','TRANSFERENCIA','AJUSTE','CROSS_DOCKING'
  quantidade numeric(12,2) not null,
  referencia_documento text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_movimentacoes_estoque_item on movimentacoes_estoque(item_id);

-- ============================================================================
-- Fim da migration 0001
-- ============================================================================
