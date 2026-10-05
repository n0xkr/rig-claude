-- ============================================================================
-- 0019 — CORREÇÕES 0.5: produtos com código sequencial/número e manutenções
--         com hora, solicitante e fotos (upload opcional).
-- Idempotente (seguro rodar mais de uma vez). Pré-requisitos: 0005 → 0018.
-- NÃO modifica a migration 0018 (UNIQUE de recebimentos.viagem_id — pendente
-- de decisão, fora do escopo desta leva).
-- REQUER VALIDAÇÃO EXTERNA: criada sem Docker/Postgres local — revisar no
-- SQL editor do Supabase (validação de sintaxe + dry-run) antes/depois de aplicar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. produtos_armazenados: `codigo` (PROD-###### gerado no servidor, único
--    entre ativos) e `numero_produto` (número/nº informado pelo usuário).
-- ----------------------------------------------------------------------------
alter table produtos_armazenados
  add column if not exists codigo text,
  add column if not exists numero_produto text;

create unique index if not exists idx_produtos_armazenados_codigo
  on produtos_armazenados(codigo) where deleted_at is null and codigo is not null;

create unique index if not exists idx_produtos_armazenados_numero_produto
  on produtos_armazenados(numero_produto)
  where deleted_at is null and numero_produto is not null;

-- Backfill determinístico dos produtos já cadastrados: continua a partir do
-- maior número já emitido pela API para nunca colidir com o índice único.
with base as (
  select coalesce(max(substring(codigo from '^PROD-0*([0-9]+)$')::bigint), 0) as maximo
    from produtos_armazenados
   where codigo ~ '^PROD-[0-9]+$'
),
numerados as (
  select p.id,
         row_number() over (order by p.created_at, p.id) + b.maximo as seq
    from produtos_armazenados p
    cross join base b
   where p.deleted_at is null and p.codigo is null
)
update produtos_armazenados p
   set codigo = 'PROD-' || lpad(n.seq::text, 6, '0'),
       updated_at = now()
  from numerados n
 where p.id = n.id;

-- ----------------------------------------------------------------------------
-- 2. manutencoes_veiculo: hora da solicitação (HH:MM), quem solicitou
--    (server-set a partir do token) e fotos opcionais (data URLs, máx. 5).
--    `hora` fica em text (e não time) para preservar exatamente o contrato
--    HH:MM do Zod compartilhado, sem segundos surpresa na leitura.
-- ----------------------------------------------------------------------------
alter table manutencoes_veiculo
  add column if not exists hora text,
  add column if not exists solicitante_id uuid references profiles(id) on delete set null,
  add column if not exists solicitante text,
  add column if not exists fotos jsonb not null default '[]'::jsonb;

alter table manutencoes_veiculo drop constraint if exists chk_manutencoes_veiculo_hora;
alter table manutencoes_veiculo
  add constraint chk_manutencoes_veiculo_hora
  check (hora is null or hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

alter table manutencoes_veiculo drop constraint if exists chk_manutencoes_veiculo_fotos;
alter table manutencoes_veiculo
  add constraint chk_manutencoes_veiculo_fotos
  check (jsonb_typeof(fotos) = 'array' and jsonb_array_length(fotos) <= 5);
