-- ============================================================================
-- Rigabras Transportes - Ecossistema Integrado de Gestao Logistica
-- Migration 0009: Módulo 9 (Importação de dados — Excel/CSV)
--
-- Ponte temporária até a integração com Google Sheets existir (critério #18
-- do documento de evolução): o usuário importa manualmente uma planilha,
-- mapeia colunas -> campos do sistema e os dados entram pelas MESMAS regras
-- de validação dos formulários normais. `import_datasets` é só o registro de
-- auditoria/histórico de cada lote importado (critério "DATASET" da seção
-- 17) — os dados em si vão para as tabelas de negócio já existentes
-- (`viagens`, `manutencoes_veiculo`), nunca para uma tabela paralela.
-- ============================================================================

create type origem_importacao as enum ('EXCEL', 'CSV', 'MANUAL');
create type status_import_dataset as enum ('VALIDADO', 'IMPORTADO', 'ERRO');

create table import_datasets (
  id uuid primary key default uuid_generate_v7(),
  nome text not null,
  target text not null,             -- 'viagens' | 'manutencoes_veiculo' (whitelist reforçada na API)
  origem origem_importacao not null default 'EXCEL',
  total_linhas integer not null default 0,
  linhas_importadas integer not null default 0,
  linhas_com_erro integer not null default 0,
  status status_import_dataset not null default 'VALIDADO',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_import_datasets_target on import_datasets(target);
create index idx_import_datasets_created_at on import_datasets(created_at desc);

alter table import_datasets enable row level security;

create policy import_datasets_select_all_roles on import_datasets
  for select using (
    current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE', 'PORTARIA')
  );
create policy import_datasets_insert_operacional on import_datasets
  for insert with check (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));

-- ============================================================================
-- Fim da migration 0009
-- ============================================================================
