-- ============================================================================
-- 0015 — Campos personalizados (colunas novas das planilhas)
-- ----------------------------------------------------------------------------
-- A importação inteligente guarda toda coluna que o sistema ainda não conhece em
-- `dados_extras` (jsonb) da viagem/veículo/motorista/cliente. Esta tabela é o
-- CATÁLOGO desses campos: cada coluna nova vira um campo com nome (rótulo) e tipo
-- (texto, número, data, data e hora, hora, sim/não) detectados pelos valores da
-- planilha, para que as telas mostrem o valor formatado (ex.: 14:30 como hora).
-- Os valores continuam em `dados_extras`; aqui fica só a definição do campo.
-- Idempotente e seguro para colar INTEIRO de uma vez no SQL Editor.
-- ============================================================================

create table if not exists campos_personalizados (
  id uuid primary key default uuid_generate_v7(),
  entidade text not null check (entidade in ('viagens', 'veiculos', 'motoristas', 'clientes')),
  -- Chave do valor dentro de dados_extras (o cabeçalho da coluna como veio da planilha).
  chave text not null,
  rotulo text not null,
  tipo text not null default 'texto'
    check (tipo in ('texto', 'numero', 'data', 'datahora', 'hora', 'booleano')),
  exemplo text,
  origem text not null default 'IMPORTACAO',
  criado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (entidade, chave)
);

create index if not exists idx_campos_personalizados_entidade on campos_personalizados(entidade);

drop trigger if exists trg_campos_personalizados_updated_at on campos_personalizados;
create trigger trg_campos_personalizados_updated_at
  before update on campos_personalizados
  for each row execute function set_updated_at();

alter table campos_personalizados enable row level security;
drop policy if exists campos_personalizados_select on campos_personalizados;
create policy campos_personalizados_select on campos_personalizados
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
