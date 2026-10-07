-- ============================================================================
-- Rigabras Transportes - Ecossistema Integrado de Gestao Logistica
-- Migration 0004: Módulo 3 (Controle Financeiro do Frete)
--  - fretes: promovido de stub (migration 0001) para tabela operacional
--    completa. Decisão de modelagem: relação 1:1 com `viagens` (uma viagem
--    encerrada tem exatamente um frete contratado a fechar financeiramente -
--    índice único parcial em viagem_id garante isso), em vez de 1:N. Se no
--    futuro a Rigabras precisar de aditivos/correções de frete por viagem,
--    a constraint pode ser relaxada em uma migration futura sem quebrar esta.
--  - status_fechamento_frete: máquina de estados explícita do fechamento da
--    viagem (critério #1): ABERTO -> EM_CONFERENCIA (conferência
--    operacional) -> APROVADO (aprovação financeira) -> PAGO (pagamento),
--    com REJEITADO como caminho de retrabalho de volta a EM_CONFERENCIA.
--  - status_frete_historico: trilha de auditoria da máquina de estados do
--    frete, no mesmo padrão de status_viagem_historico (migration 0003).
--  - frete_lancamentos: lançamentos individuais de adiantamento/desconto/
--    multa usados para calcular o saldo do frete (critério #3 do módulo).
--  - pagamentos_frete: promovido de stub para tabela operacional completa
--    (ledger de pagamentos, Lei 15.485/2026 - frete pago em até 30 dias
--    úteis).
--  - Frete de retorno vazio (critério #4): colunas `retorno_vazio`,
--    `valor_custo_retorno_vazio` (custo estimado de rodar vazio) e
--    `valor_frete_retorno` (valor de frete de retorno/backhaul quando NÃO
--    vazio), para alimentar os futuros indicadores de eficiência de frota
--    do Módulo 4 (km vazio, ocupação).
--  - RLS: segue o padrão de `apolices_seguro` (dado financeiro) para os
--    lançamentos e pagamentos - OPERADOR não tem acesso de escrita a
--    lançamentos financeiros nem a pagamentos, mas participa da conferência
--    operacional do cabeçalho do frete e pode iniciar/reencaminhar o
--    fechamento (ABERTO -> EM_CONFERENCIA, REJEITADO -> EM_CONFERENCIA).
--    Aprovação financeira (-> APROVADO) e pagamento (-> PAGO) ficam restritos
--    a ADMIN/SUPERADMIN tanto na policy de UPDATE (via WITH CHECK) quanto no
--    middleware RBAC da API (defesa em profundidade).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMs do Módulo 3
-- ----------------------------------------------------------------------------
create type status_fechamento_frete as enum (
  'ABERTO',
  'EM_CONFERENCIA',
  'APROVADO',
  'REJEITADO',
  'PAGO'
);

create type tipo_lancamento_frete as enum ('ADIANTAMENTO', 'DESCONTO', 'MULTA');

create type status_pagamento_frete as enum ('PENDENTE', 'CONFIRMADO', 'CANCELADO');

-- ----------------------------------------------------------------------------
-- fretes: migra de stub (valor_contratado, valor_veiculo_vazio, saldo_frete,
-- status_aprovacao texto livre, aprovado_por) para tabela operacional
-- completa com máquina de estados de fechamento e frete de retorno vazio.
-- ----------------------------------------------------------------------------
drop policy if exists stub_admin_full_fretes on fretes;

-- Normaliza qualquer valor pré-existente do stub antes da conversão de enum
-- (nenhuma linha é esperada em ambiente algum, já que o módulo nunca foi
-- exposto via API, mas o UPDATE é uma proteção barata contra o inesperado).
update fretes set status_aprovacao = 'ABERTO' where status_aprovacao is distinct from 'APROVADO' and status_aprovacao is distinct from 'REJEITADO';

alter table fretes rename column status_aprovacao to status_fechamento;
alter table fretes alter column status_fechamento drop default;
alter table fretes
  alter column status_fechamento type status_fechamento_frete
  using status_fechamento::status_fechamento_frete;
alter table fretes alter column status_fechamento set default 'ABERTO';
alter table fretes alter column status_fechamento set not null;

alter table fretes rename column valor_veiculo_vazio to valor_custo_retorno_vazio;

alter table fretes drop column if exists saldo_frete;

alter table fretes
  add column if not exists numero_fatura text,
  add column if not exists retorno_vazio boolean not null default true,
  add column if not exists valor_frete_retorno numeric(12,2),
  add column if not exists aprovado_em timestamptz,
  add column if not exists pago_por uuid references profiles(id),
  add column if not exists pago_em timestamptz,
  add column if not exists observacoes text,
  add column if not exists created_by uuid references profiles(id);

alter table fretes alter column valor_contratado set not null;

alter table fretes
  add constraint chk_fretes_valor_contratado check (valor_contratado >= 0),
  add constraint chk_fretes_valor_custo_retorno_vazio check (valor_custo_retorno_vazio is null or valor_custo_retorno_vazio >= 0),
  add constraint chk_fretes_valor_frete_retorno check (valor_frete_retorno is null or valor_frete_retorno >= 0);

create unique index if not exists uq_fretes_viagem_ativo on fretes(viagem_id) where deleted_at is null;
create index if not exists idx_fretes_status_fechamento on fretes(status_fechamento) where deleted_at is null;
create index if not exists idx_fretes_created_by on fretes(created_by);
create index if not exists idx_fretes_aprovado_por on fretes(aprovado_por);
create index if not exists idx_fretes_pago_por on fretes(pago_por);

create trigger trg_fretes_updated_at
  before update on fretes
  for each row execute function set_updated_at();

alter table fretes enable row level security;

create policy fretes_select_all_roles on fretes
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy fretes_insert_admin_operador on fretes
  for insert with check (
    current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR')
    and status_fechamento = 'ABERTO'
  );
-- OPERADOR só pode gravar linhas que permaneçam em ABERTO/EM_CONFERENCIA
-- (conferência operacional); somente ADMIN/SUPERADMIN podem gravar
-- APROVADO/REJEITADO/PAGO (aprovação financeira e pagamento).
create policy fretes_update_admin_operador on fretes
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'))
  with check (
    current_user_role() in ('SUPERADMIN', 'ADMIN')
    or status_fechamento in ('ABERTO', 'EM_CONFERENCIA')
  );
create policy fretes_delete_admin on fretes
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- ----------------------------------------------------------------------------
-- status_frete_historico: trilha de auditoria da máquina de estados do frete
-- (mesmo padrão de status_viagem_historico da migration 0003).
-- ----------------------------------------------------------------------------
create table status_frete_historico (
  id uuid primary key default uuid_generate_v7(),
  frete_id uuid not null references fretes(id) on delete cascade,
  status_anterior status_fechamento_frete,
  status_novo status_fechamento_frete not null,
  changed_by uuid references profiles(id),
  observacoes text,
  created_at timestamptz not null default now()
);

create index idx_status_frete_historico_frete on status_frete_historico(frete_id);
create index idx_status_frete_historico_created_at on status_frete_historico(created_at desc);

alter table status_frete_historico enable row level security;

create policy status_frete_historico_select_all_roles on status_frete_historico
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy status_frete_historico_insert_admin_operador on status_frete_historico
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));

-- ----------------------------------------------------------------------------
-- frete_lancamentos: adiantamentos, descontos e multas usados no cálculo do
-- saldo do frete (critério #3 - saldo do frete).
-- ----------------------------------------------------------------------------
create table frete_lancamentos (
  id uuid primary key default uuid_generate_v7(),
  frete_id uuid not null references fretes(id) on delete cascade,
  tipo tipo_lancamento_frete not null,
  valor numeric(12,2) not null,
  descricao text,
  data_lancamento date not null default current_date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_frete_lancamentos_valor check (valor > 0)
);

create index idx_frete_lancamentos_frete on frete_lancamentos(frete_id) where deleted_at is null;
create index idx_frete_lancamentos_tipo on frete_lancamentos(tipo);
create index idx_frete_lancamentos_created_by on frete_lancamentos(created_by);

alter table frete_lancamentos enable row level security;

-- Dado financeiro, mesmo padrão de apolices_seguro: leitura ampla, escrita
-- restrita a ADMIN/SUPERADMIN (OPERADOR participa da conferência lendo os
-- lançamentos, mas não registra adiantamento/desconto/multa).
create policy frete_lancamentos_select_all_roles on frete_lancamentos
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy frete_lancamentos_write_admin on frete_lancamentos
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN'));
create policy frete_lancamentos_delete_admin on frete_lancamentos
  for delete using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- ----------------------------------------------------------------------------
-- pagamentos_frete: migra de stub (status texto livre) para ledger de
-- pagamentos completo. Lei 15.485/2026: frete pago em até 30 dias úteis.
-- ----------------------------------------------------------------------------
drop policy if exists stub_admin_full_pagamentos_frete on pagamentos_frete;

alter table pagamentos_frete alter column status drop default;
update pagamentos_frete set status = 'PENDENTE' where status is null or status not in ('PENDENTE', 'CONFIRMADO', 'CANCELADO');
alter table pagamentos_frete
  alter column status type status_pagamento_frete
  using status::status_pagamento_frete;
alter table pagamentos_frete alter column status set default 'PENDENTE';
alter table pagamentos_frete alter column status set not null;

alter table pagamentos_frete
  add column if not exists updated_at timestamptz,
  add column if not exists created_by uuid references profiles(id);

alter table pagamentos_frete
  add constraint chk_pagamentos_frete_valor_pago check (valor_pago > 0);

create index if not exists idx_pagamentos_frete_status on pagamentos_frete(status) where deleted_at is null;
create index if not exists idx_pagamentos_frete_created_by on pagamentos_frete(created_by);

create trigger trg_pagamentos_frete_updated_at
  before update on pagamentos_frete
  for each row execute function set_updated_at();

alter table pagamentos_frete enable row level security;

create policy pagamentos_frete_select_all_roles on pagamentos_frete
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE'));
create policy pagamentos_frete_write_admin on pagamentos_frete
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN'));
create policy pagamentos_frete_delete_superadmin on pagamentos_frete
  for delete using (current_user_role() = 'SUPERADMIN');

-- ============================================================================
-- Fim da migration 0004
-- ============================================================================
