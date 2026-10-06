# Status — OPENCODE_STATUS

Estado final da execução do `OPENCODE_EXECUTION_PLAN.md` (auditoria em `docs/OPENCODE_AUDIT.md`, mudanças em `docs/OPENCODE_CHANGELOG.md`).

## Verificações (última rodada)

| Comando | Resultado |
|---|---|
| `pnpm -r run typecheck` | **verde** (shared, api, web) |
| `pnpm lint` | **verde** — ESLint 10 flat config (`eslint.config.mjs`): 0 erros, 29 warnings aceitáveis (no-console em scripts, escapes/regex de sanitização) |
| `pnpm --filter @rigabras/api run test` | **137 passed** (13 arquivos) |
| `pnpm exec playwright test` | **45 specs**: 42 passed na suíte completa; 3 timeouts de carga (`10`, `11`, `12`) passam isolados (flaky, não é regressão da leva 0.5) |
| Scan `U+FFFD` nas fontes | **negativo** |

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
| 15 — CI E2E | **CONCLUÍDO** — job `e2e` no `ci.yml` (`needs: verify`, chromium `--with-deps`, `--retries=1`, env dummy + `USE_FAKE_DB`, upload do report em falha) |
| 16 — Lint real | **CONCLUÍDO** — `eslint.config.mjs` + devDeps ESLint 10 na raiz + scripts `lint` reais + step **Lint** no CI |
| 17 — Docs OPENCODE | **CONCLUÍDO** (AUDIT, EXECUTION_PLAN, CHANGELOG, STATUS) |

## Evolução do módulo de estoque/WMS (pedido do usuário)

- **Entrada/saída**: `/wms/estoque` com saldo por endereço, botões Entrada/Saída/Transferir por linha, "Nova movimentação" para criar o primeiro saldo, histórico do ledger. Saída valida saldo; documento obrigatório em todo lançamento.
- **Cadastro/edição de itens**: recebimentos editáveis enquanto `AGUARDANDO` e expedições enquanto `SOLICITADA` (adicionar/editar/remover), com SKU exibido no card.
- **Retiradas/entradas**: movimentações manuais gravadas só no ledger (`movimentacoes_estoque`), saldo materializado nunca é editado direto.
- **Edição de produto**: SKU, descrição, unidade, peso, volume e flag ativo pela tela.

## Leva CORREÇÕES 0.5 (WMS + frota — entregue)

- **Submenus do WMS**: `WmsSubNav` em todas as 14 telas do Módulo 5.
- **Produtos únicos**: `codigo` `PROD-######` gerado no servidor (único entre ativos, retry) + `numero_produto`; "+ Adicionar novo..." também em Estoque e no card de itens da expedição.
- **Manutenções**: hora (HH:MM), solicitante (server-set), fotos opcionais (≤5, ≤500 KB cada) na solicitação; lista com data da solicitação, tempo decorrido e badge de previsão da próxima.
- **Veículos**: CRUD completo em `/frota/veiculos` (+ rota de navegação lateral).
- **Redes dos veículos**: painel exclusivo em `/wms/redes` com cadastro (condição/validade/padrão-cliente), KPIs em tempo real (auto-refresh 20s) e movimentação retirada/devolução (máquina de estados `DISPONIVEL`↔`EM_TRANSITO`).
- **Migrations prontas**: `0019` (produtos + manutenções) e `0020` (redes + RLS no padrão da 0006) — **aguardam aplicação no SQL editor do Supabase** (REQUER VALIDAÇÃO EXTERNA); `0018` intocada.
- **Ação do usuário**: aplicar `supabase/migrations/0019_*` e `0020_*` no Supabase e fazer redeploy no Coolify (repositório atualizado via `git push origin master`).

## Leva CHECKLIST DE REDES (WMS > Checklist > Redes — entregue, prazo 15/10)

- **Seção Redes no submenu Checklist**: `WmsSubNav` ganhou o grupo "Checklist" com sub-item "Redes"; rota `/wms/checklist/redes` (o antigo `/wms/redes` redireciona).
- **Checklist da rede (3 critérios obrigatórios)**: rede OK sem danos?, lacre (número) e catracas OK (6)? — regra **tudo-ou-nada** imposta no serviço (422 se parcial) e na constraint da migration; `11 cintas × 11` e `6 catracas` exibidos como especificação (`CINTAS_POR_REDE`/`CATRACAS_POR_REDE`).
- **Acompanhamento do gestor**: painel "Progresso do checklist" (`X/Y redes conferidas (%)` + barra, auto-refresh 20s), badge `Checklist OK`/`pendente` por linha e filtro concluído/pendente (`?checklist=`).
- **CRUD**: edição por linha (`useUpdateRede`/`PATCH /wms/redes/:id`) além do cadastro/exclusão/movimentação já existentes.
- **Migration**: `0021_redes_checklist.sql` — **aguarda aplicação no SQL editor do Supabase** (REQUER VALIDAÇÃO EXTERNA).
- **Validação local**: `pnpm typecheck` verde · `pnpm lint` 0 erros · `pnpm --filter @rigabras/api test` 137 passed · E2E `18-wms-redes.spec.ts` 2 passed.

## Decisões pendentes do usuário (AUDIT §8)

1. **Migration 0018** (UNIQUE `recebimentos.viagem_id`): deduplicação + índice + teste de corrida. Não escrita por risco de falha em dados existentes.
2. **RBAC de VISITANTE**: API (`fretes`/`motoristas`) × RLS (`0002`) × comentário divergente — qual fonte vale.
3. **Purga da fila no logout**: implementada por decisão autônoma (purga só do usuário que sai, uid capturado antes do clear do token). Reavaliar se a política desejada é outra (ex.: nunca purgar).

## Fora deste ambiente

Postgres/Supabase real: migrations 0018+, RPCs transacionais, RLS efetivo, testes de concorrência (Fases 11–13) e validação de auth/refresh.
