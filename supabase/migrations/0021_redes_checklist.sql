-- ============================================================================
-- 0021 — CHECKLIST DE REDES (WMS > Checklist > Redes): ao cadastrar/editar uma
--         rede de contenção, o operador preenche os critérios de conferência:
--         rede OK sem danos, número do lacre e as 6 catracas OK. Quando os
--         três estão presentes o checklist é marcado como concluído
--         (`checklist_concluido_em`/`_por` são derivados no servidor).
-- Idempotente (seguro rodar mais de uma vez). Pré-requisitos: 0006 → 0020.
-- REQUER VALIDAÇÃO EXTERNA: criada sem Docker/Postgres local — revisar no
-- SQL editor do Supabase (validação de sintaxe + dry-run) antes/depois de aplicar.
-- RBAC: herda as policies da tabela `redes` (migration 0020) — nenhuma policy
-- nova é necessária (mesma tabela).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas do checklist na tabela `redes`
-- ----------------------------------------------------------------------------
alter table redes add column if not exists checklist_rede_ok boolean;
alter table redes add column if not exists checklist_lacre text;
alter table redes add column if not exists checklist_catracas_ok boolean;
alter table redes add column if not exists checklist_concluido_em timestamptz;
alter table redes add column if not exists checklist_concluido_por uuid references profiles(id);

-- Checklist é tudo-ou-nada: os três critérios juntos ou nenhum (evita linha
-- "meio preenchida" que distorce o percentual de progresso do gestor).
alter table redes drop constraint if exists chk_redes_checklist_completo;
alter table redes add constraint chk_redes_checklist_completo check (
  (
    checklist_rede_ok is null
    and checklist_lacre is null
    and checklist_catracas_ok is null
  )
  or (
    checklist_rede_ok is not null
    and checklist_lacre is not null
    and length(trim(checklist_lacre)) > 0
    and checklist_catracas_ok is not null
  )
);

-- ----------------------------------------------------------------------------
-- 2. Índice de progresso (filtro "checklist pendente/concluído" do painel)
-- ----------------------------------------------------------------------------
create index if not exists idx_redes_checklist_concluido
  on redes(checklist_concluido_em) where deleted_at is null;
