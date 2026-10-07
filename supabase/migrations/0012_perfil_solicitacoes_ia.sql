-- ============================================================================
-- 0012 — Perfil do usuário + Solicitações da IA (cadastro automatizado por planilha)
-- ----------------------------------------------------------------------------
-- 1. profiles: campos de personalização (foto, função, atribuições...). O e-mail
--    continua imutável pelo próprio usuário.
-- 2. veiculos / motoristas: colunas tipadas extras + `dados_extras` (jsonb) para
--    guardar TODA informação da planilha que não tem coluna própria.
-- 3. Novas tabelas de cadastro: rastreadores, pontos_apoio, clientes.
-- 4. ia_solicitacoes: fila de aprovação/perguntas geradas pela IA ao importar
--    planilhas. NADA é gravado nas tabelas de negócio sem aprovação/resposta.
-- 5. ia_conhecimento: respostas dadas às perguntas da IA (colunas/abas), reaplicadas
--    nas próximas importações para que a mesma dúvida nunca seja feita duas vezes.
-- Tudo aditivo e anulável: não quebra dados nem código existentes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles
-- ----------------------------------------------------------------------------
alter table profiles
  add column if not exists avatar_url text,
  add column if not exists funcao text,
  add column if not exists atribuicoes text,
  add column if not exists telefone text,
  add column if not exists departamento text,
  add column if not exists bio text;

-- ----------------------------------------------------------------------------
-- 2. veiculos
-- ----------------------------------------------------------------------------
alter table veiculos
  add column if not exists proprietario text,
  add column if not exists vinculo text,
  add column if not exists rntrc_numero text,
  add column if not exists rntrc_validade date,
  add column if not exists crlv_validade date,
  add column if not exists inspecao_tecnica_validade date,
  add column if not exists tacografo_validade date,
  add column if not exists capacidade_m3 numeric(10,2),
  add column if not exists dados_extras jsonb;

-- ----------------------------------------------------------------------------
-- 2. motoristas
-- ----------------------------------------------------------------------------
alter table motoristas
  add column if not exists codigo_externo text,
  add column if not exists apelido text,
  add column if not exists vinculo text,
  add column if not exists nacionalidade text,
  add column if not exists data_admissao date,
  add column if not exists cnh_ear boolean,
  add column if not exists toxicologico_data date,
  add column if not exists toxicologico_vencimento date,
  add column if not exists mopp boolean,
  add column if not exists mopp_validade date,
  add column if not exists doc_viagem_tipo text,
  add column if not exists doc_viagem_validade date,
  add column if not exists treinamento_pgr_data date,
  add column if not exists placa_habitual text,
  add column if not exists observacao text,
  add column if not exists dados_extras jsonb;

create unique index if not exists uq_motoristas_codigo_externo
  on motoristas(codigo_externo) where codigo_externo is not null and deleted_at is null;

-- ----------------------------------------------------------------------------
-- 3. rastreadores
-- ----------------------------------------------------------------------------
create table if not exists rastreadores (
  id uuid primary key default uuid_generate_v7(),
  codigo_externo text,
  placa text,
  veiculo_id uuid references veiculos(id) on delete set null,
  funcao text,
  fabricante text,
  modelo text,
  comunicacao text,
  id_terminal text,
  serial_esn text,
  imei text,
  iccid_operadora text,
  bateria_isca smallint,
  data_instalacao date,
  status text,
  homologado boolean,
  observacao text,
  dados_extras jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create unique index if not exists uq_rastreadores_codigo_externo
  on rastreadores(codigo_externo) where codigo_externo is not null and deleted_at is null;
create index if not exists idx_rastreadores_placa on rastreadores(placa) where deleted_at is null;
create index if not exists idx_rastreadores_veiculo on rastreadores(veiculo_id);

create trigger trg_rastreadores_updated_at
  before update on rastreadores
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. pontos_apoio (pontos homologados + pontos mais frequentes detectados)
-- ----------------------------------------------------------------------------
create table if not exists pontos_apoio (
  id uuid primary key default uuid_generate_v7(),
  codigo_externo text,
  nome text not null,
  nome_normalizado text not null,
  tipo text,
  cidade text,
  uf text,
  pais text,
  latitude numeric(10,6),
  longitude numeric(10,6),
  homologado_por text,
  patio_fechado boolean,
  permite_pernoite boolean,
  frequencia integer,
  origem_registro text not null default 'PLANILHA',
  observacao text,
  dados_extras jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create unique index if not exists uq_pontos_apoio_nome
  on pontos_apoio(nome_normalizado) where deleted_at is null;

create trigger trg_pontos_apoio_updated_at
  before update on pontos_apoio
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. clientes (embarcadores)
-- ----------------------------------------------------------------------------
create table if not exists clientes (
  id uuid primary key default uuid_generate_v7(),
  codigo_externo text,
  nome text not null,
  nome_normalizado text not null,
  documento text,
  pais text,
  tipo text,
  exige_gr_propria boolean,
  gr_cliente text,
  exige_espelhamento boolean,
  pgr_proprio boolean,
  ddr boolean,
  regras text,
  contato text,
  dados_extras jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create unique index if not exists uq_clientes_nome
  on clientes(nome_normalizado) where deleted_at is null;
create unique index if not exists uq_clientes_codigo_externo
  on clientes(codigo_externo) where codigo_externo is not null and deleted_at is null;

create trigger trg_clientes_updated_at
  before update on clientes
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. ia_solicitacoes
-- ----------------------------------------------------------------------------
create table if not exists ia_solicitacoes (
  id uuid primary key default uuid_generate_v7(),
  dataset_id uuid references import_datasets(id) on delete set null,
  tipo text not null check (tipo in ('CADASTRO', 'ATUALIZACAO', 'PERGUNTA')),
  entidade text not null,              -- veiculos | motoristas | rastreadores | clientes | pontos_apoio | coluna | planilha
  titulo text not null,
  descricao text,
  aba text,
  linha integer,
  coluna text,
  chave_natural text,                  -- placa, código, nome normalizado... (evita consultar jsonb)
  dados_propostos jsonb,
  dados_atuais jsonb,                  -- para ATUALIZACAO: como o registro está hoje
  evidencia jsonb,                     -- valores originais lidos na planilha
  pergunta text,
  campo_pergunta text,                 -- campo de dados_propostos que a resposta preenche
  entrada text check (entrada in ('OPCAO', 'TEXTO')),
  opcoes jsonb,                        -- [{valor, rotulo}]
  sugestao_ia jsonb,                   -- {valor, confianca, motivo} — só sugestão, nunca aplicada sozinha
  resposta jsonb,
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'APROVADA', 'RECUSADA', 'RESPONDIDA', 'ERRO')),
  erro text,
  registro_id uuid,                    -- id do registro criado/atualizado ao aprovar
  chave_dedup text not null,
  decidido_por uuid references profiles(id) on delete set null,
  decidido_em timestamptz,
  created_at timestamptz not null default now()
);

-- Reimportar a mesma planilha não recria pedidos já feitos (nem os recusados);
-- pedidos em ERRO podem ser refeitos.
create unique index if not exists uq_ia_solicitacoes_dedup
  on ia_solicitacoes(chave_dedup) where status <> 'ERRO';
create index if not exists idx_ia_solicitacoes_status on ia_solicitacoes(status, created_at desc);
create index if not exists idx_ia_solicitacoes_dataset on ia_solicitacoes(dataset_id);
create index if not exists idx_ia_solicitacoes_chave on ia_solicitacoes(entidade, chave_natural);

alter table ia_solicitacoes enable row level security;
create policy ia_solicitacoes_select_admin on ia_solicitacoes
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN'));
create policy ia_solicitacoes_update_admin on ia_solicitacoes
  for update using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- ----------------------------------------------------------------------------
-- 5. ia_conhecimento
-- ----------------------------------------------------------------------------
create table if not exists ia_conhecimento (
  id uuid primary key default uuid_generate_v7(),
  aba_norm text not null,
  coluna_norm text not null default '',
  entidade text not null,
  destino text not null,               -- chave de campo | '__extra__' | '__ignorar__' | nome da entidade (para abas)
  respondido_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (aba_norm, coluna_norm)
);

alter table ia_conhecimento enable row level security;
create policy ia_conhecimento_select_admin on ia_conhecimento
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN'));

-- RLS das novas tabelas de cadastro: leitura para todos os papéis, escrita operacional
-- (a API usa service role; estas policies protegem acessos diretos ao banco).
alter table rastreadores enable row level security;
alter table pontos_apoio enable row level security;
alter table clientes enable row level security;

create policy rastreadores_select on rastreadores
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE', 'PORTARIA'));
create policy pontos_apoio_select on pontos_apoio
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE', 'PORTARIA'));
create policy clientes_select on clientes
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE', 'PORTARIA'));

create policy rastreadores_write on rastreadores
  for all using (current_user_role() in ('SUPERADMIN', 'ADMIN'))
  with check (current_user_role() in ('SUPERADMIN', 'ADMIN'));
create policy pontos_apoio_write on pontos_apoio
  for all using (current_user_role() in ('SUPERADMIN', 'ADMIN'))
  with check (current_user_role() in ('SUPERADMIN', 'ADMIN'));
create policy clientes_write on clientes
  for all using (current_user_role() in ('SUPERADMIN', 'ADMIN'))
  with check (current_user_role() in ('SUPERADMIN', 'ADMIN'));
