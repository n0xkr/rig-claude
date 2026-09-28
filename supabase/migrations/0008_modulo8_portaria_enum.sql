-- ============================================================================
-- Rigabras Transportes - Ecossistema Integrado de Gestao Logistica
-- Migration 0008 (parte 1/2): novos valores de enums já existentes.
--
-- Isolado em um arquivo próprio porque o Postgres proíbe usar um valor de
-- enum recém-adicionado (`ALTER TYPE ... ADD VALUE`) dentro da MESMA
-- transação em que ele foi criado ("unsafe use of new value... must be
-- committed before they can be used", erro 55P04) — e o restante da
-- migration 0008 (RLS) referencia 'PORTARIA' logo em seguida. Rodando este
-- arquivo primeiro (e deixando-o COMMITAR sozinho) antes de
-- `0008_modulo8_portaria_schema.sql`, o valor já existe e pode ser usado
-- livremente. Ao rodar via SQL editor do Supabase (que envolve o script
-- colado em uma única transação implícita), execute este arquivo em uma
-- consulta separada da consulta do arquivo `_schema`.
-- ============================================================================

alter type user_role add value if not exists 'PORTARIA';
alter type origem_evento_viagem add value if not exists 'PORTARIA';

-- ============================================================================
-- Fim da migration 0008 (parte 1/2)
-- ============================================================================
