# Status — OPENCODE_STATUS

Estado final da execução do `OPENCODE_EXECUTION_PLAN.md` (auditoria em `docs/OPENCODE_AUDIT.md`, mudanças em `docs/OPENCODE_CHANGELOG.md`).

## Verificações (última rodada)

| Comando | Resultado |
|---|---|
| `pnpm -r run typecheck` | **verde** (shared, api, web) |
| `pnpm -r run lint` | placeholder (ESLint real = Fase 16, pendente) |
| `pnpm --filter @rigabras/api run test` | **137 passed** (13 arquivos) |
| `pnpm exec playwright test` | **43 passed** (~10 min) |

## Fases do plano

| Fase | Estado |
|---|---|
| 0 — Baseline | CONCLUÍDO |
| 1 — P0/P1 (1.1 handler DomainError, 1.2 fake DB, 1.3 timeout, 1.4 badge fila, 1.5 purga por uid, 1.6 claims atômicos, 1.7 PUT idempotente) | **CONCLUÍDO** (1.5 por decisão autônoma) |
| 2 — Idempotência + offline | **CONCLUÍDO\*** (\*retry/backoff auditados já existentes) |
| 3 — Auth/refresh | CONCLUÍDO\* (pré-existente; \*validação com Postgres pendente) |
| 4 — RBAC | PENDENTE — aguarda decisão VISITANTE (AUDIT §8.2) |
| 5/6 — WMS atomicidade | PARCIAL — claims/conferência concluídos; RPCs `FOR UPDATE` **BLOQUEADOS (ambiente)** |
| 7 — Estados/fila de viagem | PARCIAL (pré-existente) |
| 8 — Financeiro | CONCLUÍDO\* |
| 9 — Idempotência transacional | **CONCLUÍDO** (pré-existente + PUT) |
| 10 — Offline queue | **CONCLUÍDO** (pré-existente + badge + purga por usuário) |
| 11 — Testes de concorrência | BLOQUEADO (ambiente) |
| 12 — RLS real | BLOQUEADO (ambiente) |
| 13 — Migration 0018 | REQUER DECISÃO (AUDIT R1) |
| 14 — ERP export | CONCLUÍDO\* |
| 15 — CI E2E | PENDENTE (custo de runner) |
| 16 — Lint real | PENDENTE |
| 17 — Docs OPENCODE | **CONCLUÍDO** (AUDIT, EXECUTION_PLAN, CHANGELOG, STATUS) |

## Evolução do módulo de estoque/WMS (pedido do usuário)

- **Entrada/saída**: `/wms/estoque` com saldo por endereço, botões Entrada/Saída/Transferir por linha, "Nova movimentação" para criar o primeiro saldo, histórico do ledger. Saída valida saldo; documento obrigatório em todo lançamento.
- **Cadastro/edição de itens**: recebimentos editáveis enquanto `AGUARDANDO` e expedições enquanto `SOLICITADA` (adicionar/editar/remover), com SKU exibido no card.
- **Retiradas/entradas**: movimentações manuais gravadas só no ledger (`movimentacoes_estoque`), saldo materializado nunca é editado direto.
- **Edição de produto**: SKU, descrição, unidade, peso, volume e flag ativo pela tela.

## Decisões pendentes do usuário (AUDIT §8)

1. **Migration 0018** (UNIQUE `recebimentos.viagem_id`): deduplicação + índice + teste de corrida. Não escrita por risco de falha em dados existentes.
2. **RBAC de VISITANTE**: API (`fretes`/`motoristas`) × RLS (`0002`) × comentário divergente — qual fonte vale.
3. **Purga da fila no logout**: implementada por decisão autônoma (purga só do usuário que sai, uid capturado antes do clear do token). Reavaliar se a política desejada é outra (ex.: nunca purgar).

## Fora deste ambiente

Postgres/Supabase real: migrations 0018+, RPCs transacionais, RLS efetivo, testes de concorrência (Fases 11–13) e validação de auth/refresh.
