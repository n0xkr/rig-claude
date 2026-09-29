-- ============================================================================
-- 0011 — Acompanhamento de veículos (gestão de frota)
-- ----------------------------------------------------------------------------
-- Estado operacional "vivo" de cada veículo, alimentado inicialmente por
-- planilhas (importação com IA) e editável na tela de Acompanhamento.
-- Colunas aditivas e anuláveis: não quebra nenhum dado nem código existente.
-- ============================================================================

alter table veiculos
  add column if not exists status_operacional text not null default 'DISPONIVEL',
  add column if not exists motorista_atual text,
  add column if not exists km_atual numeric(10,1),
  add column if not exists nivel_combustivel smallint,
  add column if not exists localizacao_atual text,
  add column if not exists ultima_manutencao_data date,
  add column if not exists proxima_manutencao_data date,
  add column if not exists observacoes_acompanhamento text;

alter table veiculos drop constraint if exists veiculos_status_operacional_check;
alter table veiculos add constraint veiculos_status_operacional_check
  check (status_operacional in ('DISPONIVEL', 'EM_TRANSITO', 'MANUTENCAO', 'GARAGEM'));

alter table veiculos drop constraint if exists veiculos_nivel_combustivel_check;
alter table veiculos add constraint veiculos_nivel_combustivel_check
  check (nivel_combustivel is null or (nivel_combustivel between 0 and 100));

create index if not exists idx_veiculos_status_operacional
  on veiculos(status_operacional) where deleted_at is null;
create index if not exists idx_veiculos_proxima_manutencao
  on veiculos(proxima_manutencao_data) where deleted_at is null;
