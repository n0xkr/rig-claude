-- ============================================================================
-- Rigabras Transportes - Ecossistema Integrado de Gestao Logistica
-- Migration 0007: Módulo 6 (Integração TMS + WMS) e Módulo 7 (Integração ERP)
--
-- Decisões de modelagem (documentadas também em docs/NOTES.md):
--
--  1. Expedição -> Viagem (critério "cargo pronta para coleta"): a FK
--     `expedicoes.viagem_id` JÁ EXISTIA (migration 0006, nullable, preenchida
--     "pelo futuro Módulo 6"). Este módulo é quem finalmente a usa. Nenhuma
--     coluna nova é necessária nesta ponta.
--
--  2. Evento cross-módulo na linha do tempo da viagem: em vez de criar uma
--     tabela de eventos nova, reaproveitamos `status_viagem_historico`
--     (Módulo 2) — que já é a linha do tempo exibida no frontend — e
--     adicionamos a coluna `origem_evento` para distinguir uma transição real
--     de status (`MANUAL`, o padrão, mantendo 100% de compatibilidade com as
--     linhas já gravadas pelos Módulos 1-5) de uma NOTA informativa disparada
--     pelo WMS (`WMS`) que não necessariamente muda o status da viagem (ex:
--     "expedição X pronta para coleta" enquanto a viagem continua
--     PROGRAMADA/AGUARDANDO_COLETA). Uma nota WMS grava
--     `status_anterior = status_novo` (não é uma transição de fato) —
--     distinguível de uma transição real justamente pela coluna
--     `origem_evento`.
--
--  3. Entrega -> Recebimento: o TMS (Módulo 2) não tem hoje nenhum conceito
--     de "depositante" (cliente do Armazém Geral, Módulo 5) nem de
--     detalhamento de SKU/quantidade da carga transportada — `viagens`
--     guarda carga como campo livre (`peso_kg`, `valor_frete`). Para permitir
--     a criação automática (ainda que parcial, só o cabeçalho) de um
--     `recebimento` a partir da entrega, adicionamos duas colunas mínimas em
--     `viagens`:
--       - `destino_armazem_rigabras` (boolean, default false): sinaliza que
--         esta viagem tem como destino final o Armazém Geral da Rigabras
--         (e não um cliente externo), habilitando a automação.
--       - `depositante_id` (FK opcional para `depositantes`): o depositante
--         do Módulo 5 dono da carga, para que o `recebimento` automático
--         saiba de quem é a mercadoria. Sem este campo preenchido, a
--         automação grava uma nota WMS explicando por que não pôde criar o
--         recebimento (nunca falha silenciosamente, nunca bloqueia a
--         confirmação de entrega).
--     Também adicionamos `recebimentos.viagem_id` (FK opcional para
--     `viagens`) para o caminho inverso — a tela de detalhe do recebimento
--     mostrar a viagem de origem, e `GET /viagens/:id/wms-status` localizar o
--     recebimento gerado a partir de uma viagem.
--
--  4. Módulo 7 (Integração ERP) é uma exportação DERIVADA (fretes/lançamentos
--     /pagamentos do Módulo 3 e movimentacoes_estoque do Módulo 5) — não
--     introduz nenhuma tabela nova. Nenhuma alteração de schema é necessária
--     para o Módulo 7 além do que já existe.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Módulo 6, nota de modelagem #2: origem do evento na linha do tempo da viagem.
-- ----------------------------------------------------------------------------
create type origem_evento_viagem as enum ('MANUAL', 'WMS');

alter table status_viagem_historico
  add column origem_evento origem_evento_viagem not null default 'MANUAL';

-- ----------------------------------------------------------------------------
-- Módulo 6, nota de modelagem #3: sinalização de destino e depositante na viagem.
-- ----------------------------------------------------------------------------
alter table viagens
  add column destino_armazem_rigabras boolean not null default false;

alter table viagens
  add column depositante_id uuid references depositantes(id) on delete set null;

create index idx_viagens_depositante on viagens(depositante_id) where deleted_at is null;

-- ----------------------------------------------------------------------------
-- Módulo 6, nota de modelagem #3: caminho inverso recebimento -> viagem.
-- ----------------------------------------------------------------------------
alter table recebimentos
  add column viagem_id uuid references viagens(id) on delete set null;

create index idx_recebimentos_viagem on recebimentos(viagem_id) where deleted_at is null;

-- ============================================================================
-- Fim da migration 0007
-- ============================================================================
