# Auditoria Rigabras TMS + WMS — OPENCODE_AUDIT

Data: 2026-10-05 · Commits: `dbc2af6` (HEAD) / `origin/master` = HEAD · Ambiente: Windows, **sem Docker/Postgres real**

Legenda: `IMPLEMENTADO` · `PARCIAL` · `QUEBRADO` · `REQUER DECISÃO` · `REQUER VALIDAÇÃO EXTERNA` · `NÃO VALIDADO`

---

## 1. Estado do sistema

| Dimensão | Estado | Evidência |
|---|---|---|
| Monorepo pnpm, 3 apps/packages | IMPLEMENTADO | `pnpm -r` roda |
| Typecheck (`pnpm -r run typecheck`) | IMPLEMENTADO | verde em 2026-10-05 |
| Build (`pnpm -r run build`) | IMPLEMENTADO | verde em 2026-10-05 |
| Testes API (Vitest) | IMPLEMENTADO | 12 arquivos, **131 testes verdes** |
| E2E (Playwright, fake DB) | IMPLEMENTADO | **41/41 verdes**, 16 specs |
| CI (GitHub Actions) | PARCIAL | `.github/workflows/ci.yml`: typecheck+vitest+build+secret scan; **sem job E2E** |
| Lint | QUEBRADO | placeholder `echo "(lint placeholder - configure eslint)"` em api/web/shared |
| Postgres real / migrations aplicadas | NÃO VALIDADO | sem Docker neste ambiente |
| RLS efetiva | NÃO VALIDADO | SQL inspecionado, nunca executado |
| Concorrência real (claims WMS) | NÃO VALIDADO | depende de Postgres real |

LOC verificados: api 26.798 · web 18.404 · shared 4.685 · 17 migrations (0001–0017) · 26 arquivos `*.routes.ts` (168 rotas) · 46 páginas web · 16 specs E2E.

---

## 2. Correção anti-alucinação (item retractado)

- **`profiles_insert_admin_only` SEM restrição de role** — achado anterior **FALSO**. `0002_rls_policies.sql:37-38` tem `with check (current_user_role() in ('SUPERADMIN', 'ADMIN'))`. Não é vulnerabilidade. Proteção de `role`/`ativo`/`categoria_id` extra é redundante e existe em `proteger_campos_acesso_profile` (`0013:63`, endurecida em `0016:26`, trigger `0013:87`).

---

## 3. Achados P0

| # | Achado | Status | Evidência |
|---|---|---|---|
| P0-1 | E2E: `supabaseAdmin.rpc is not a function` derrubava conferência WMS e transição PAGO (specs 02/04/06/15 falhando, 7 falhas na suíte) | **CORRIGIDO (working tree)** | fix em `apps/api/src/config/fakeSupabase.ts` — `rpc()` retorna erro `PGRST202` → fallback legado em `estoque.repository.ts:46` e `fretes.repository.ts:230`; spec 09: fake agora emula `PRIMARY KEY (user_id, key)` de `idempotency_keys` (`0017:235-244`) devolvendo `23505` → replay de idempotência |
| P0-2 | Falha intermitente 09 (`toHaveCount` placa ausente) por cold-start Vite ~9s vs timeout default 5s | **CORRIGIDO (working tree)** | `playwright.config.ts`: `expect.timeout: 15_000` |
| P0-3 | `app.setErrorHandler` não trata `DomainError` — controllers sem handler local viram 500 genérico | QUEBRADO | `apps/api/src/app.ts:123-138` trata só `pgErrorToProblem`; 8 controllers sem `handleDomainError` próprio: auditoria, auth, chatbot, groq, iaSolicitacoes, importacao, perfil, usuarios |

## 4. Achados P1

| # | Achado | Status | Evidência |
|---|---|---|---|
| P1-1 | Fila offline sem UI de falhas: `onQueueChange`/`statusDaFila`/`tentarNovamenteFalhas` exportados e **nunca consumidos** por componente | QUEBRADO | `apps/web/src/offline/db.ts`, `syncManager.ts`; grep: 0 usos em `.tsx` |
| P1-2 | Logout não limpa a fila offline (PII de outro usuário pode persistir em IndexedDB no mesmo browser) | QUEBRADO | `components/layout/DashboardLayout.tsx:210-226` (mitigação parcial: sync filtra por `userId`) |
| P1-3 | WMS multi-write sem transação/claim atômico: conferência faz 3 writes independentes; transição de status é read-then-write sem lock | QUEBRADO | `recebimentos.service.ts:194-216`; `expedicoes.service.ts:97-118`; `inventarios.service.ts` |
| P1-4 | Idempotência só em POST/PATCH — mutações offline de PUT ficam sem proteção | PARCIAL | `middleware/idempotency.ts:26` |
| P1-5 | RBAC API × RLS divergem para VISITANTE: API devolve fretes/saldo/pagamentos/documentos de motorista; RLS 0017 os bloqueia (service-role ignora RLS) | **REQUER DECISÃO** | API: `fretes.routes.ts` GETs e `motoristas.routes.ts:29` incluem VISITANTE; `0017` remove VISITANTE de select de `fretes/pagamentos/motorista_documentos`; comentário `0002` diz "VISITANTE = leitura em tudo que não for financeiro/seguros", mas `apolices_select_admin_visitante` (`0002:101`) dá VISITANTE acesso a apólices |
| P1-6 | Sem job E2E na CI — regressões só aparecem em máquina local | PARCIAL | `.github/workflows/ci.yml` |
| P1-7 | Lint = placeholder em todos os workspaces | QUEBRADO | `package.json` api/web/shared |

## 5. Achados P2/P3

| # | Achado | Status | Evidência |
|---|---|---|---|
| P2-1 | `recebimentos.viagem_id` só tem índice **não-único**; `criarAutomaticoDeViagem` faz find-then-create → corrida duplica recebimento | **REQUER DECISÃO** | `0007:75-77`; `recebimentos.service.ts:95-118`; migration 0018 UNIQUE **não escrita** (pode falhar em dados duplicados do banco vivo) |
| P2-2 | `randomPlaca()` só 9.999 valores → colisão entre rodadas de E2E possível | PARCIAL | `tests/e2e/helpers.ts:95-101` |
| P2-3 | Fila offline não é purgada nem por falha persistente (sem UX de resolução) | QUEBRADO | deriva de P1-1 |
| P3-1 | Evidências de concorrência/RLS não cobertas por teste automatizado | NÃO VALIDADO | sem Postgres real |
| P3-2 | Docs pré-existentes desatualizados em relação ao estado atual | PARCIAL | `docs/AUDIT/ANALISE_COMPLETA.md`, `docs/execution/EXECUTION_PLAN.md` (status NOT READY) |

---

## 6. Dívida técnica (ordenada por impacto)

1. **Sem integração Postgres/RLS testada** — todo o layer de segurança database é `NÃO VALIDADO`. Maior risco do projeto.
2. **Fila offline opaca** — confiabilidade offline declarada no README, sem observabilidade nem recuperação de falhas.
3. **WMS sem atomicidade** — perda de estoque/duplicação de movimentos sob corrida.
4. **RBAC VISITANTE ambíguo** — política documentada ≠ RLS ≠ API.
5. **CI sem E2E e sem lint real** — barreira de qualidade abaixo do tamanho do codebase.
6. **8 controllers sem `handleDomainError`** — 500s inconsistentes até P0-3 ser corrigido globalmente.

## 7. Riscos

- **R1 (alto)**: executar migration UNIQUE `recebimentos.viagem_id` em banco com duplicatas → falha de deploy. Mitigação: deduplicação prévia ou índice parcial; **REQUER DECISÃO**.
- **R2 (alto)**: qualquer RPC SQL nova (WMS atômico) exige Postgres real para validar; fake DB não executa funções.
- **R3 (médio)**: apertar RBAC de VISITANTE pode quebrar páginas/UX em produção (nenhum spec E2E ou componente menciona VISITANTE).
- **R4 (médio)**: purga da fila no logout pode perder trabalho offline não sincronizado vs. deixar PII em IndexedDB. **REQUER DECISÃO**.
- **R5 (baixo)**: ambientes com Vite frio <15s ainda podem flakar E2E.

## 8. Itens REQUER DECISÃO (consolidados)

1. Migration 0018 UNIQUE `recebimentos.viagem_id` (deduplicar antes? índice parcial? skip?).
2. Alinhar VISITANTE: API → RLS (remover leitura financeira/documentos), RLS → comentário (remover VISITANTE de apólices), ou aceitar divergência documentada.
3. Purga da fila offline no logout: limpar tudo (perde trabalho offline), limpar só usuários trocados, ou manter com UI visível.
