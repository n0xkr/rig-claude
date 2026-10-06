# Plano de Execução — OPENCODE_EXECUTION_PLAN

Contexto: `docs/OPENCODE_AUDIT.md` · Base: `dbc2af6` · Regras: preservar contratos, Zod, RBAC, RLS, ledger imutável, fila offline; P0→P3; sem reescrita.

Estado legenda: `CONCLUÍDO` · `PARCIAL` · `PENDENTE` · `BLOQUEADO (ambiente)`

---

## Fase 0 — Baseline
Estado: **CONCLUÍDO**. install, typecheck, build, Vitest 131 verdes. E2E baseline: 7 falhas → 4 → 1 → **41/41 verdes** após fixes P0-1/P0-2.

## Fase 1 — P0/P1 imediatos
| Task | Estado | Detalhe |
|---|---|---|
| 1.1 Handler global `DomainError` | **CONCLUÍDO** | `app.ts` — `DomainError` → problem+json no `setErrorHandler` |
| 1.2 Fix fake DB (rpc + idempotency) | **CONCLUÍDO** | `fakeSupabase.ts` — `rpc()` → `PGRST202`; `idempotency_keys` → `23505` |
| 1.3 E2E timeout 15s | **CONCLUÍDO** | `playwright.config.ts` |
| 1.4 UI/status fila offline | **CONCLUÍDO** | `OfflineQueueIndicator` no header: badge pendentes/falhas + `tentarNovamenteFalhas` |
| 1.5 Logout × fila | **CONCLUÍDO\*** | \*decisão autônoma: `purgeQueueDoUsuario(uid)` (uid capturado antes do clear do token); tradeoff: perde trabalho offline não sincronizado — reavaliar (AUDIT §8.3) |
| 1.6 Claims atômicos WMS | **CONCLUÍDO** | `updateIfStatus(...)` em recebimentos/expedicoes/inventarios → `ConflictError` em corrida; `claimItemConferencia` evita ledger duplicado |
| 1.7 Idempotência em PUT | **CONCLUÍDO** | `idempotency.ts` cobre POST/PATCH/PUT |

## Fase 2 — Idempotência + offline
Estado: **CONCLUÍDO\***. PUT coberto, UX de fila (badge/retry), purga decidida; retry/backoff já auditados.

## Fase 3 — Auth/refresh/rotating tokens
Estado: **CONCLUÍDO\*** (pré-existente, `docs/execution/EXECUTION_PLAN.md`). \*Validação com Postgres real pendente.

## Fase 4 — RBAC
Estado: PENDENTE. Após decisão VISITANTE (AUDIT §8.2): alinhar `fretes.routes.ts`, `motoristas.routes.ts:29`, apólices, e specs E2E de 403.

## Fase 5/6 — WMS atomicidade
Estado: PARCIAL. Claims atômicos + conferência sem movimentação duplicada **CONCLUÍDOS**. Passo seguinte **BLOQUEADO (ambiente)**: RPCs `SECURITY DEFINER` com `SELECT ... FOR UPDATE` exigem Postgres real.

## Fase 7 — Estados/fila de viagem
Estado: PARCIAL (pré-existente). Verificar `trg_fretes_transicao` (`0017:190`) contra service de transição.

## Fase 8 — Financeiro
Estado: **CONCLUÍDO\*** (pré-existente). Ledger imutável preservado (`0017`).

## Fase 9 — Idempotência transacional
Estado: **CONCLUÍDO** (pré-existente `idempotency_keys` em 0017 + extensão PUT).

## Fase 10 — Offline queue
Estado: **CONCLUÍDO** (pré-existente + badge de status + purga por usuário).

## Fase 11 — Testes de concorrência
Estado: **BLOQUEADO (ambiente)** — exige Postgres real.

## Fase 12 — RLS real
Estado: **BLOQUEADO (ambiente)** — exige `supabase start`/migrations aplicadas.

## Fase 13 — Migration 0018 (UNIQUE `recebimentos.viagem_id`)
Estado: **REQUER DECISÃO** (R1 do AUDIT). Critério de saída: deduplicação scriptada + índice único + teste de corrida em `criarAutomaticoDeViagem`.

## Fase 14 — ERP export
Estado: **CONCLUÍDO\*** (pré-existente).

## Fase 15 — CI E2E
Estado: **CONCLUÍDO**. Job `e2e` no `ci.yml`: `needs: verify` (economia de runner quando verify já falhou), Playwright chromium via `playwright install --with-deps`, suíte com `--retries=1` (absorve o flaky 10/11/12), env dummy para o Zod de `env.ts` + `USE_FAKE_DB=true`/`WEB_ORIGIN`, upload de `playwright-report/`+`test-results/` em falha, `timeout-minutes: 45`.

## Fase 16 — Lint real
Estado: **CONCLUÍDO**. ESLint 10 flat config em `eslint.config.mjs` (devDeps na raiz: `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `globals`); scripts `lint` reais (`pnpm lint` → `eslint .`; `eslint src` em api/web/shared); step **Lint** no job `verify`. Resultado: **0 erros / 29 warnings**. Fora do lint: protótipo legado `gestão-de-frotas-&-viagens/` (não é workspace) e `*.cjs`.

## Fase 17 — Docs/entregáveis OPENCODE
Estado: **CONCLUÍDO**. `OPENCODE_AUDIT.md`, este arquivo, `OPENCODE_CHANGELOG.md`, `OPENCODE_STATUS.md`.

## Fase 18 — Evolução WMS (pedido do usuário)
Estado: **CONCLUÍDO**.
- API: `EstoqueService`/controller/rotas de saldos, movimentações manuais e histórico; CRUD de itens de recebimento/expedição; validação de saldo na saída; produto do depositante validado em criação/edição.
- Web: página `/wms/estoque` (linha, avulsa, histórico), checklist de entrada (`AGUARDANDO`) e saída (`SOLICITADA`), edição de produto.
- Testes: `estoque.service.test.ts` (+6) e `17-wms-estoque-manual.spec.ts` (+2).

## Fase 19 — Leva CORREÇÕES 0.5 (pedido do usuário)
Estado: **CONCLUÍDO**.
- WMS: `WmsSubNav` nas 14 telas; produtos com `codigo` `PROD-######` server-side + `numero_produto`; "+ Adicionar novo..." em Estoque e nos itens da expedição; painel **Redes dos veículos** (`/wms/redes`) com KPIs, retirada/devolução e máquina de estados.
- Frota: solicitação de manutenção com hora (HH:MM), solicitante server-set e fotos (≤5, ≤500 KB); manutenções com tempo decorrido e previsão da próxima; CRUD de veículos (`/frota/veiculos`).
- Migrations `0019` (produtos + manutenções) e `0020` (redes + RLS 0006) escritas — **REQUER VALIDAÇÃO EXTERNA** (aplicar no Supabase); `0018` intocada (REQUER DECISÃO).
- Testes: `18-wms-redes.spec.ts` (+2); encoding U+FFFD corrigido em 5 páginas e scan final negativo.

---

## Ordem de execução recomendada
1. ~~Fase 1~~ · ~~Fase 15~~ · ~~Fase 16~~ · ~~Fase 17~~ · ~~Fase 18~~ · ~~Fase 19~~ · commit + `git push origin master`.
2. Usuário: aplicar migrations `0019`/`0020` no SQL editor do Supabase + redeploy no Coolify.
3. Fora deste ambiente: Fases 11–13, decisões 1/2/3 do AUDIT §8.

## Critérios de aceite globais
- `pnpm -r run typecheck` verde · `pnpm lint` verde (0 erros) · `pnpm --filter @rigabras/api run test` **137 verdes** · E2E **45 specs** (42 verdes na suíte completa + 3 flaky de timeout que passam isolados; CI com `--retries=1`).
- Nenhum contrato de rota/Zod alterado sem nota no CHANGELOG.
- Achados `REQUER DECISÃO`/`REQUER VALIDAÇÃO EXTERNA` nunca marcados como concluídos.
