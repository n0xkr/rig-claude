-- ============================================================================
-- 0022 — GERENCIAMENTO DE RISCO (menu próprio): na viagem, acrescenta as
--         marcações de liberação usadas pela equipe — OK perfil segurança,
--         OK conjunto validado (cavalo + carreta), OK autorização de
--         embarque, autorização enviada ao motorista — e o campo de
--         "rota do motorista" (link/observação da rota com pedágios).
--         `checklist_ok` e `pesquisa_ok` já existem (migration 0014).
-- Idempotente (seguro rodar mais de uma vez). Pré-requisitos: 0001 → 0021.
-- REQUER VALIDAÇÃO EXTERNA: criada sem Docker/Postgres local — revisar no
-- SQL editor do Supabase (validação de sintaxe + dry-run) antes/depois de aplicar.
-- RBAC: herda as policies da tabela `viagens` (migrations 0001/0002) —
-- nenhuma policy nova (mesma tabela). Rastreabilidade ISO 9001: cada marcação
-- passa pelo PATCH /viagens/:id e gera linha em `audit_logs` (quem/quando).
-- ============================================================================

alter table viagens
  add column if not exists perfil_seguranca_ok boolean not null default false,
  add column if not exists conjunto_validado_ok boolean not null default false,
  add column if not exists autorizacao_embarque_ok boolean not null default false,
  add column if not exists autorizacao_motorista_enviada boolean not null default false,
  add column if not exists rota_motorista text;

comment on column viagens.perfil_seguranca_ok
  is 'OK perfil segurança: pesquisa/consulta do motorista concluída (gerenciamento de risco)';
comment on column viagens.conjunto_validado_ok
  is 'OK conjunto validado: cavalo + carreta conferidos na viagem';
comment on column viagens.autorizacao_embarque_ok
  is 'OK autorização de embarque liberada para a carga';
comment on column viagens.autorizacao_motorista_enviada
  is 'Autorização de embarque já enviada ao motorista (registro de evidência)';
comment on column viagens.rota_motorista
  is 'Rota do motorista: link de navegação/observação da rota com pedágios';
