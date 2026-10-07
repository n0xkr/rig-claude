-- ============================================================================
-- Rigabras Transportes - Ecossistema Integrado de Gestao Logistica
-- Migration 0006: Módulo 5 (WMS - Armazém Geral, Decreto 1.102/1903)
--
-- Decisões de modelagem (documentadas também em docs/NOTES.md, para os
-- Módulos 6/7 que vão construir EM CIMA destas tabelas):
--
--  1. `depositantes` vs `clientes` de transporte: o Armazém Geral vende um
--     serviço distinto (guarda/conferência/reembalagem de mercadoria de
--     terceiros, Decreto 1.102/1903) do frete rodoviário internacional dos
--     Módulos 1-4. Um mesmo cliente PODE ser ao mesmo tempo um cliente de
--     frete e um depositante do armazém, mas são papéis independentes — por
--     isso `depositantes` é uma tabela própria (razão social/CNPJ/contato),
--     nunca uma FK para uma tabela de "clientes de frete" (que não existe
--     hoje como entidade própria; `viagens`/`fretes` guardam o cliente como
--     texto livre). Isso mantém o Módulo 5 autocontido e evita acoplar o WMS
--     a uma modelagem de cliente que pode mudar independentemente.
--
--  2. Inventário como LEDGER imutável, nunca como campo mutável solto:
--     `movimentacoes_estoque` é a fonte da verdade — cada linha é um evento
--     de estoque imutável (insert-only, sem update/delete de dado, mesmo
--     padrão de `registros_jornada` no Módulo 4): RECEBIMENTO, ENDERECAMENTO,
--     SEPARACAO, REEMBALAGEM, ETIQUETAGEM, TRANSFERENCIA, CROSS_DOCKING,
--     EXPEDICAO, AVARIA, AJUSTE_INVENTARIO. A tabela `estoque` é um SALDO
--     MATERIALIZADO (produto x endereço) mantido pela camada de serviço a
--     cada movimentação, para consulta rápida (ocupação, telas de picking) —
--     nunca a fonte da verdade. O endpoint de inventário/contagem
--     (`POST /inventarios/:id/contagem`) sempre reconcilia `estoque` a partir
--     da soma de `movimentacoes_estoque`, e qualquer divergência entre o
--     saldo contado fisicamente e o saldo do ledger gera uma NOVA linha
--     `AJUSTE_INVENTARIO` (nunca um UPDATE silencioso do saldo).
--
--  3. `movimentacoes_estoque.tipo_movimentacao` inclui os valores
--     'CROSS_DOCKING' e 'EXPEDICAO' como chaves estáveis (nunca renomeadas)
--     porque um futuro módulo de integração TMS+WMS (Módulo 6, fora do
--     escopo desta migration) precisa referenciar exatamente esses tipos
--     para casar uma expedição do armazém com uma viagem do TMS. Pelo mesmo
--     motivo, `expedicoes.viagem_id` já existe como FK opcional (nullable)
--     para `viagens` — preenchida pelo Módulo 6, nunca por este módulo.
--
--  4. Substituição dos stubs da migration 0001: `estoque_itens` e a antiga
--     `movimentacoes_estoque` (texto livre, sem ledger de fato) são
--     descartadas e substituídas pelo modelo completo abaixo. `armazens`
--     (migration 0001) é mantida como está — é o prédio físico (5.500 m²
--     cobertos, ver base de conhecimento) — e ganha apenas FKs a partir das
--     novas tabelas.
--
--  5. RLS/RBAC: mesmo padrão operacional dos Módulos 2-4. Leitura aberta a
--     todos os papéis autenticados (inclusive VISITANTE — painéis de
--     ocupação/KPI, sem dado financeiro sensível). OPERADOR pode registrar
--     movimentações, recebimentos, expedições e avarias (trabalho de piso).
--     A CRIAÇÃO de um inventário (contagem) é operacional (OPERADOR), mas a
--     RECONCILIAÇÃO/APROVAÇÃO de ajustes de inventário (que altera o saldo
--     oficial) fica restrita a ADMIN/SUPERADMIN — mesmo racional do Módulo 3
--     (aprovação financeira restrita), pois um ajuste de inventário tem
--     efeito financeiro/contratual sobre o depositante. Exclusão (soft
--     delete) de cadastro (depositantes/produtos/endereços) restrita a
--     SUPERADMIN/ADMIN; a própria `movimentacoes_estoque` NÃO tem policy de
--     update/delete para nenhum papel além de SUPERADMIN (imutabilidade do
--     ledger, mesmo padrão de `registros_jornada`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMs do Módulo 5
-- ----------------------------------------------------------------------------
create type status_endereco_armazem as enum ('LIVRE', 'OCUPADO', 'BLOQUEADO');

create type tipo_movimentacao_estoque as enum (
  'RECEBIMENTO',
  'ENDERECAMENTO',
  'SEPARACAO',
  'REEMBALAGEM',
  'ETIQUETAGEM',
  'TRANSFERENCIA',
  'CROSS_DOCKING',
  'EXPEDICAO',
  'AVARIA',
  'AJUSTE_INVENTARIO'
);

create type status_recebimento as enum (
  'AGUARDANDO',
  'EM_CONFERENCIA',
  'CONFERIDO',
  'ENDERECADO',
  'DIVERGENTE'
);

create type tipo_expedicao as enum ('NORMAL', 'CROSS_DOCKING');

create type status_expedicao as enum (
  'SOLICITADA',
  'EM_SEPARACAO',
  'SEPARADA',
  'EM_REEMBALAGEM',
  'PRONTA_EXPEDICAO',
  'EXPEDIDA',
  'CANCELADA'
);

create type severidade_avaria as enum ('LEVE', 'MODERADA', 'GRAVE', 'PERDA_TOTAL');

create type status_inventario as enum ('ABERTO', 'EM_CONTAGEM', 'RECONCILIADO', 'ENCERRADO');

-- ----------------------------------------------------------------------------
-- depositantes — clientes do serviço de Armazém Geral (ver nota de
-- modelagem #1 acima). Independente da entidade de cliente de frete.
-- ----------------------------------------------------------------------------
create table depositantes (
  id uuid primary key default uuid_generate_v7(),
  razao_social text not null,
  cnpj_cpf text not null,
  contato_nome text,
  contato_email text,
  contato_telefone text,
  ativo boolean not null default true,
  observacoes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create unique index idx_depositantes_cnpj_cpf on depositantes(cnpj_cpf) where deleted_at is null;
create index idx_depositantes_ativo on depositantes(ativo) where deleted_at is null;

create trigger trg_depositantes_updated_at
  before update on depositantes
  for each row execute function set_updated_at();

alter table depositantes enable row level security;
create policy depositantes_select_all_roles on depositantes
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy depositantes_write_admin_operador on depositantes
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy depositantes_update_admin_operador on depositantes
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy depositantes_delete_admin on depositantes
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- ----------------------------------------------------------------------------
-- produtos_armazenados — catálogo SKU por depositante.
-- ----------------------------------------------------------------------------
create table produtos_armazenados (
  id uuid primary key default uuid_generate_v7(),
  depositante_id uuid not null references depositantes(id) on delete restrict,
  sku text not null,
  descricao text not null,
  unidade_medida text not null default 'UN',
  peso_kg numeric(10,3),
  volume_m3 numeric(10,4),
  ativo boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint chk_produtos_armazenados_peso check (peso_kg is null or peso_kg >= 0),
  constraint chk_produtos_armazenados_volume check (volume_m3 is null or volume_m3 >= 0)
);
create unique index idx_produtos_armazenados_depositante_sku
  on produtos_armazenados(depositante_id, sku) where deleted_at is null;
create index idx_produtos_armazenados_depositante on produtos_armazenados(depositante_id) where deleted_at is null;

create trigger trg_produtos_armazenados_updated_at
  before update on produtos_armazenados
  for each row execute function set_updated_at();

alter table produtos_armazenados enable row level security;
create policy produtos_armazenados_select_all_roles on produtos_armazenados
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy produtos_armazenados_write_admin_operador on produtos_armazenados
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy produtos_armazenados_update_admin_operador on produtos_armazenados
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy produtos_armazenados_delete_admin on produtos_armazenados
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- ----------------------------------------------------------------------------
-- enderecos_armazem — bin/localização (área/rua/prateleira/posição) dentro
-- do armazém coberto de 5.500 m² (ver RIGABRAS_BASE_DE_CONHECIMENTO.md).
-- ----------------------------------------------------------------------------
create table enderecos_armazem (
  id uuid primary key default uuid_generate_v7(),
  armazem_id uuid not null references armazens(id) on delete restrict,
  area text not null,
  rua text not null,
  prateleira text not null,
  posicao text not null,
  capacidade_m3 numeric(10,4),
  status status_endereco_armazem not null default 'LIVRE',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint chk_enderecos_armazem_capacidade check (capacidade_m3 is null or capacidade_m3 >= 0)
);
create unique index idx_enderecos_armazem_posicao
  on enderecos_armazem(armazem_id, area, rua, prateleira, posicao) where deleted_at is null;
create index idx_enderecos_armazem_armazem on enderecos_armazem(armazem_id) where deleted_at is null;
create index idx_enderecos_armazem_status on enderecos_armazem(status) where deleted_at is null;

create trigger trg_enderecos_armazem_updated_at
  before update on enderecos_armazem
  for each row execute function set_updated_at();

alter table enderecos_armazem enable row level security;
create policy enderecos_armazem_select_all_roles on enderecos_armazem
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy enderecos_armazem_write_admin_operador on enderecos_armazem
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy enderecos_armazem_update_admin_operador on enderecos_armazem
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy enderecos_armazem_delete_admin on enderecos_armazem
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- ----------------------------------------------------------------------------
-- estoque — saldo MATERIALIZADO (produto x endereço). NUNCA é a fonte da
-- verdade (ver nota de modelagem #2): é recalculado/reconciliado a partir de
-- `movimentacoes_estoque`. Mantido pela camada de serviço a cada
-- movimentação, para consultas rápidas (ocupação, picking, KPIs).
-- ----------------------------------------------------------------------------
create table estoque (
  id uuid primary key default uuid_generate_v7(),
  produto_id uuid not null references produtos_armazenados(id) on delete restrict,
  endereco_id uuid not null references enderecos_armazem(id) on delete restrict,
  quantidade numeric(14,3) not null default 0,
  reconciliado_em timestamptz,
  updated_at timestamptz not null default now(),
  constraint chk_estoque_quantidade check (quantidade >= 0)
);
create unique index idx_estoque_produto_endereco on estoque(produto_id, endereco_id);
create index idx_estoque_produto on estoque(produto_id);
create index idx_estoque_endereco on estoque(endereco_id);

alter table estoque enable row level security;
create policy estoque_select_all_roles on estoque
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy estoque_write_admin_operador on estoque
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy estoque_update_admin_operador on estoque
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy estoque_delete_superadmin on estoque
  for delete using (current_user_role() = 'SUPERADMIN');

-- ----------------------------------------------------------------------------
-- recebimentos / recebimento_itens — entrada e conferência (critério
-- "Recebimento e Conferência").
-- ----------------------------------------------------------------------------
create table recebimentos (
  id uuid primary key default uuid_generate_v7(),
  depositante_id uuid not null references depositantes(id) on delete restrict,
  referencia_documento text,
  status status_recebimento not null default 'AGUARDANDO',
  data_prevista date,
  data_recebimento timestamptz,
  observacoes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index idx_recebimentos_depositante on recebimentos(depositante_id) where deleted_at is null;
create index idx_recebimentos_status on recebimentos(status) where deleted_at is null;

create trigger trg_recebimentos_updated_at
  before update on recebimentos
  for each row execute function set_updated_at();

create table recebimento_itens (
  id uuid primary key default uuid_generate_v7(),
  recebimento_id uuid not null references recebimentos(id) on delete cascade,
  produto_id uuid not null references produtos_armazenados(id) on delete restrict,
  quantidade_esperada numeric(14,3) not null,
  quantidade_conferida numeric(14,3),
  endereco_id uuid references enderecos_armazem(id) on delete set null,
  divergente boolean not null default false,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint chk_recebimento_itens_qtd_esperada check (quantidade_esperada >= 0),
  constraint chk_recebimento_itens_qtd_conferida check (quantidade_conferida is null or quantidade_conferida >= 0)
);
create index idx_recebimento_itens_recebimento on recebimento_itens(recebimento_id);
create index idx_recebimento_itens_produto on recebimento_itens(produto_id);

create trigger trg_recebimento_itens_updated_at
  before update on recebimento_itens
  for each row execute function set_updated_at();

alter table recebimentos enable row level security;
create policy recebimentos_select_all_roles on recebimentos
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy recebimentos_write_admin_operador on recebimentos
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy recebimentos_update_admin_operador on recebimentos
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy recebimentos_delete_admin on recebimentos
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

alter table recebimento_itens enable row level security;
create policy recebimento_itens_select_all_roles on recebimento_itens
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy recebimento_itens_write_admin_operador on recebimento_itens
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy recebimento_itens_update_admin_operador on recebimento_itens
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy recebimento_itens_delete_admin on recebimento_itens
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- ----------------------------------------------------------------------------
-- expedicoes / expedicao_itens — separação/reembalagem/etiquetagem,
-- cross-docking e expedição (critérios "Separação, Reembalagem,
-- Etiquetagem" e "Cross-docking / Consolidação / Expedição"). `viagem_id`
-- fica nullable e é preenchida pelo futuro Módulo 6 (integração TMS+WMS) —
-- ver nota de modelagem #3.
-- ----------------------------------------------------------------------------
create table expedicoes (
  id uuid primary key default uuid_generate_v7(),
  depositante_id uuid not null references depositantes(id) on delete restrict,
  viagem_id uuid references viagens(id) on delete set null,
  referencia_documento text,
  tipo tipo_expedicao not null default 'NORMAL',
  status status_expedicao not null default 'SOLICITADA',
  data_solicitacao timestamptz not null default now(),
  data_expedicao timestamptz,
  observacoes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index idx_expedicoes_depositante on expedicoes(depositante_id) where deleted_at is null;
create index idx_expedicoes_status on expedicoes(status) where deleted_at is null;
create index idx_expedicoes_viagem on expedicoes(viagem_id) where deleted_at is null;

create trigger trg_expedicoes_updated_at
  before update on expedicoes
  for each row execute function set_updated_at();

create table expedicao_itens (
  id uuid primary key default uuid_generate_v7(),
  expedicao_id uuid not null references expedicoes(id) on delete cascade,
  produto_id uuid not null references produtos_armazenados(id) on delete restrict,
  endereco_id uuid references enderecos_armazem(id) on delete set null,
  quantidade_solicitada numeric(14,3) not null,
  quantidade_separada numeric(14,3),
  reembalado boolean not null default false,
  etiquetado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint chk_expedicao_itens_qtd_solicitada check (quantidade_solicitada >= 0),
  constraint chk_expedicao_itens_qtd_separada check (quantidade_separada is null or quantidade_separada >= 0)
);
create index idx_expedicao_itens_expedicao on expedicao_itens(expedicao_id);
create index idx_expedicao_itens_produto on expedicao_itens(produto_id);

create trigger trg_expedicao_itens_updated_at
  before update on expedicao_itens
  for each row execute function set_updated_at();

alter table expedicoes enable row level security;
create policy expedicoes_select_all_roles on expedicoes
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy expedicoes_write_admin_operador on expedicoes
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy expedicoes_update_admin_operador on expedicoes
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy expedicoes_delete_admin on expedicoes
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

alter table expedicao_itens enable row level security;
create policy expedicao_itens_select_all_roles on expedicao_itens
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy expedicao_itens_write_admin_operador on expedicao_itens
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy expedicao_itens_update_admin_operador on expedicao_itens
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy expedicao_itens_delete_admin on expedicao_itens
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- ----------------------------------------------------------------------------
-- inventarios / inventario_itens — contagem física periódica, reconciliação
-- contra o saldo do ledger (critério "Inventário"). A ABERTURA/contagem é
-- operacional (OPERADOR); a RECONCILIAÇÃO (que gera ajustes de estoque,
-- efeito financeiro/contratual sobre o depositante) fica restrita a
-- ADMIN/SUPERADMIN — ver nota de modelagem #5. Criada ANTES de
-- `movimentacoes_estoque` para que esta possa referenciá-la (evita
-- dependência circular).
-- ----------------------------------------------------------------------------
create table inventarios (
  id uuid primary key default uuid_generate_v7(),
  armazem_id uuid not null references armazens(id) on delete restrict,
  status status_inventario not null default 'ABERTO',
  data_abertura timestamptz not null default now(),
  data_encerramento timestamptz,
  observacoes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index idx_inventarios_armazem on inventarios(armazem_id) where deleted_at is null;
create index idx_inventarios_status on inventarios(status) where deleted_at is null;

create trigger trg_inventarios_updated_at
  before update on inventarios
  for each row execute function set_updated_at();

create table inventario_itens (
  id uuid primary key default uuid_generate_v7(),
  inventario_id uuid not null references inventarios(id) on delete cascade,
  produto_id uuid not null references produtos_armazenados(id) on delete restrict,
  endereco_id uuid not null references enderecos_armazem(id) on delete restrict,
  quantidade_sistema numeric(14,3) not null,
  quantidade_contada numeric(14,3),
  ajustado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint chk_inventario_itens_qtd_sistema check (quantidade_sistema >= 0),
  constraint chk_inventario_itens_qtd_contada check (quantidade_contada is null or quantidade_contada >= 0)
);
create index idx_inventario_itens_inventario on inventario_itens(inventario_id);
create index idx_inventario_itens_produto on inventario_itens(produto_id);

create trigger trg_inventario_itens_updated_at
  before update on inventario_itens
  for each row execute function set_updated_at();

alter table inventarios enable row level security;
create policy inventarios_select_all_roles on inventarios
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy inventarios_write_admin_operador on inventarios
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
-- Reconciliação/encerramento (UPDATE) restrita a ADMIN/SUPERADMIN — efeito
-- financeiro/contratual sobre o depositante (ver nota de modelagem #5).
create policy inventarios_update_admin on inventarios
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN'));
create policy inventarios_delete_admin on inventarios
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

alter table inventario_itens enable row level security;
create policy inventario_itens_select_all_roles on inventario_itens
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy inventario_itens_write_admin_operador on inventario_itens
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy inventario_itens_update_admin on inventario_itens
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN'));
create policy inventario_itens_delete_admin on inventario_itens
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- ----------------------------------------------------------------------------
-- movimentacoes_estoque — LEDGER imutável (ver nota de modelagem #2).
-- Substitui o stub homônimo da migration 0001 (texto livre, sem ledger de
-- fato). Insert-only: sem policy de update/delete além de SUPERADMIN.
-- ----------------------------------------------------------------------------
drop table if exists movimentacoes_estoque;
drop table if exists estoque_itens;

create table movimentacoes_estoque (
  id uuid primary key default uuid_generate_v7(),
  produto_id uuid not null references produtos_armazenados(id) on delete restrict,
  tipo_movimentacao tipo_movimentacao_estoque not null,
  quantidade numeric(14,3) not null,
  endereco_origem_id uuid references enderecos_armazem(id) on delete set null,
  endereco_destino_id uuid references enderecos_armazem(id) on delete set null,
  recebimento_id uuid references recebimentos(id) on delete set null,
  expedicao_id uuid references expedicoes(id) on delete set null,
  inventario_id uuid references inventarios(id) on delete set null,
  referencia_documento text,
  observacoes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  constraint chk_movimentacoes_estoque_quantidade check (quantidade > 0)
);
create index idx_movimentacoes_estoque_produto on movimentacoes_estoque(produto_id);
create index idx_movimentacoes_estoque_tipo on movimentacoes_estoque(tipo_movimentacao);
create index idx_movimentacoes_estoque_created_at on movimentacoes_estoque(created_at desc);
create index idx_movimentacoes_estoque_recebimento on movimentacoes_estoque(recebimento_id) where recebimento_id is not null;
create index idx_movimentacoes_estoque_expedicao on movimentacoes_estoque(expedicao_id) where expedicao_id is not null;
create index idx_movimentacoes_estoque_inventario on movimentacoes_estoque(inventario_id) where inventario_id is not null;

alter table movimentacoes_estoque enable row level security;
create policy movimentacoes_estoque_select_all_roles on movimentacoes_estoque
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy movimentacoes_estoque_insert_admin_operador on movimentacoes_estoque
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy movimentacoes_estoque_delete_superadmin on movimentacoes_estoque
  for delete using (current_user_role() = 'SUPERADMIN');
-- Sem policy de UPDATE (nem para SUPERADMIN): o ledger é imutável por
-- design — uma correção é sempre um novo evento (ex: um AJUSTE_INVENTARIO),
-- nunca a edição de uma linha já lançada (mesmo racional de registros_jornada).

-- ----------------------------------------------------------------------------
-- avarias — controle de avarias, ligado a um produto e opcionalmente à
-- movimentação/endereço onde foi constatada (critério "Controle de
-- avarias"). Criada DEPOIS de `movimentacoes_estoque` para poder
-- referenciá-la (a movimentação que registrou o evento AVARIA no ledger).
-- ----------------------------------------------------------------------------
create table avarias (
  id uuid primary key default uuid_generate_v7(),
  produto_id uuid not null references produtos_armazenados(id) on delete restrict,
  movimentacao_id uuid references movimentacoes_estoque(id) on delete set null,
  endereco_id uuid references enderecos_armazem(id) on delete set null,
  severidade severidade_avaria not null,
  quantidade numeric(14,3) not null,
  descricao text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint chk_avarias_quantidade check (quantidade > 0)
);
create index idx_avarias_produto on avarias(produto_id) where deleted_at is null;
create index idx_avarias_severidade on avarias(severidade);
create index idx_avarias_created_at on avarias(created_at desc);

create trigger trg_avarias_updated_at
  before update on avarias
  for each row execute function set_updated_at();

alter table avarias enable row level security;
create policy avarias_select_all_roles on avarias
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy avarias_write_admin_operador on avarias
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy avarias_update_admin_operador on avarias
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
create policy avarias_delete_admin on avarias
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- ============================================================================
-- Fim da migration 0006
-- ============================================================================
