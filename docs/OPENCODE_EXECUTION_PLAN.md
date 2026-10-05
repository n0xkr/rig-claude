# Plano de Execução — OPENCODE_EXECUTION_PLAN

Contexto: `docs/OPENCODE_AUDIT.md` · Base: `dbc2af6` · Regras: preservar contratos, Zod, RBAC, RLS, ledger imutável, fila offline; P0→P3; sem reescrita.

Estado legenda: `CONCLUÍDO` · `PARCIAL` · `PENDENTE` · `BLOQUEADO (ambiente)`

---

## Fase 0 — Baseline
Estado: **CONCLUÍDO**. install, typecheck, build, Vitest 131 verdes. E2E baseline: 7 falhas → 4 → 1 → **41/41 verdes** após fixes P0-1/P0-2.

## Fase 1 — P0/P1 imediatos (em execução)
| Task | Estado | Detalhe |
|---|---|---|
| 1.1 Handler global `DomainError` | PENDENTE | `app.ts:123-138` → mapear `DomainError.status/detail` em problem+json; remove 500 dos 8 controllers sem handler local |
| 1.2 Fix fake DB (rpc + idempotency) | **CONCLUÍDO** | `fakeSupabase.ts` — `rpc()` → `PGRST202`; `idempotency_keys` → `23505` |
| 1.3 E2E timeout 15s | **CONCLUÍDO** | `playwright.config.ts` |
| 1.4 UI/status fila offline | PENDENTE | `DashboardLayout` consome `statusDaFila`/`onQueueChange`: badge pendentes/falhas + botão `tentarNovamenteFalhas` |
| 1.5 Logout × fila | **REQUER DECISÃO** | opções no AUDIT §8.3; implementação mínima: escopar purga por `userId` atual |
| 1.6 Claims atômicos WMS | PENDENTE | update condicional por `status` esperado (`eq('status', esperado)`) em transição de expedicação/recebimento/inventário; sem RPC nova (evita bloqueio Postgres) |
| 1.7 Idempotência em PUT | PARCIAL | incluir `PUT` no middleware `idempotency.ts:26` (DELETE já é idempotente por spec) |

## Fase 2 — Idempotência + offline
Estado: PENDENTE. Cobrir PUT (1.7), UX de falhas (1.4), retry/backoff auditados, purga decidida (1.5).

## Fase 3 — Auth/refresh/rotating tokens
Estado: **CONCLUÍDO\*** (pré-existente, `docs/execution/EXECUTION_PLAN.md`). \*Validação com Postgres real pendente.

## Fase 4 — RBAC
Estado: PENDENTE. Após decisão VISITANTE (AUDIT §8.2): alinhar `fretes.routes.ts`, `motoristas.routes.ts:29`, apólices, e specs E2E de 403.

## Fase 5/6 — WMS atomicidade
Estado: PENDENTE (1.6 é o primeiro passo sem RPC). Passo seguinte **BLOQUEADO (ambiente)**: RPCs `SECURITY DEFINER` com `SELECT ... FOR UPDATE` exigem Postgres real.

## Fase 7 — Estados/fila de viagem
Estado: PARCIAL (pré-existente). Verificar `trg_fretes_transicao` (`0017:190`) contra service de transição.

## Fase 8 — Financeiro
Estado: **CONCLUÍDO\*** (pré-existente). Ledger imutável preservado (`0017`).

## Fase 9 — Idempotência transacional
Estado: **CONCLUÍDO\*** (pré-existente, `idempotency_keys` em 0017) + extensão PUT (1.7) PENDENTE.

## Fase 10 — Offline queue
Estado: **CONCLUÍDO\*** (pré-existente) + observabilidade (1.4/1.5) PENDENTES.

## Fase 11 — Testes de concorrência
Estado: **BLOQUEADO (ambiente)** — exige Postgres real.

## Fase 12 — RLS real
Estado: **BLOQUEADO (ambiente)** — exige `supabase start`/migrations aplicadas.

## Fase 13 — Migration 0018 (UNIQUE `recebimentos.viagem_id`)
Estado: **REQUER DECISÃO** (R1 do AUDIT). Critério de saída: deduplicação scriptada + índice único + teste de corrida em `criarAutomaticoDeViagem`.

## Fase 14 — ERP export
Estado: **CONCLUÍDO\*** (pré-existente).

## Fase 15 — CI E2E
Estado: PENDENTE. Job `e2e` no `ci.yml` (build + `playwright install --with-deps` + `pnpm e2e`), após decisão sobre custo de runner.

## Fase 16 — Lint real
Estado: PENDENTE. Substituir placeholder por ESLint flat config + `pnpm lint` no CI.

## Fase 17 — Docs/entregáveis OPENCODE
Estado: PARCIAL. `OPENCODE_AUDIT.md` ✓, este arquivo ✓; `OPENCODE_CHANGELOG.md` e `OPENCODE_STATUS.md` pendentes.

---

## Ordem de execução recomendada
1. Fase 1 (1.1 → 1.6 → 1.7 → 1.4) com regressão typecheck+vitest+E2E.
2. Fase 17 (changelog/status).
3. Commit + `git push origin master`.
4. Fora deste ambiente: Fases 11–13, 15–16, decisões 1/2/3 do AUDIT §8.

## Critérios de aceite globais
- `pnpm -r run typecheck` verde · `pnpm -r run test` ≥131 verdes · E2E 41/41 verdes.
- Nenhum contrato de rota/Zod alterado sem nota no CHANGELOG.
- Achados `REQUER DECISÃO`/`REQUER VALIDAÇÃO EXTERNA` nunca marcados como concluídos.
