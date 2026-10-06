# CHANGELOG — OPENCODE_CHANGELOG

Registro das mudanças entregues na execução do `OPENCODE_EXECUTION_PLAN.md` (base `dbc2af6`) e na **leva CORREÇÕES 0.5**. Contratos/Zod/RBAC/RLS/ledger imutável/fila offline preservados; migrations novas limitadas a `0019`/`0020` (a `0018` não foi tocada).

Legenda: `ADICIONADO` · `CORRIGIDO` · `MELHORADO` · `REQUER DECISÃO` · `REQUER VALIDAÇÃO EXTERNA`

---

## API (`apps/api`)

### Correções P0/P1
| O quê | Tipo | Onde |
|---|---|---|
| Handler global `DomainError` → problem+json (409/404/400 em vez de 500) | CORRIGIDO | `app.ts` (`setErrorHandler`) |
| Middleware de idempotência cobre também `PUT` (antes só POST/PATCH) | CORRIGIDO | `middleware/idempotency.ts` |
| Transições de status com claim atômico (`.eq('status', esperado)` → `ConflictError` em corrida) | MELHORADO | `recebimentos/expedicoes/inventarios.service.ts` + `*.repository.ts` (`updateIfStatus`) |
| Conferência de item não movimenta o ledger duas vezes (claim `.is('quantidade_conferida', null)`) | CORRIGIDO | `recebimentos.repository.claimItemConferencia` |
| Fake DB: `rpc()` → `PGRST202`, `idempotency_keys` → `23505` | CORRIGIDO | `config/fakeSupabase.ts` |

### WMS — estoque/itens (evolução solicitada)
| O quê | Tipo | Onde |
|---|---|---|
| `EstoqueService`/`estoque.controller`: listagem de saldos (joins produto/endereço/depositante + busca `q`), movimentações manuais e histórico | ADICIONADO | `wms/estoque.service.ts`, `wms/estoque.controller.ts` |
| Rotas `GET /wms/estoque`, `GET|POST /wms/estoque/movimentacoes` (LEITURA_TODOS / ESCRITA_OPERACIONAL) | ADICIONADO | `wms/wms.routes.ts` |
| Saída manual valida saldo de origem (`ConflictError`); produto/endereço inexistentes → `NotFoundError` | ADICIONADO | `estoque.service.movimentarManual` |
| Movimentação manual sempre grava `referencia_documento` no ledger + audit log | ADICIONADO | `estoque.service` |
| CRUD de itens de recebimento (`POST|PATCH|DELETE /wms/recebimentos/:id/itens[/:itemId]`) — guarda `AGUARDANDO`, item não conferido, ≥1 item, produto do depositante | ADICIONADO | `recebimentos.service/controller` |
| CRUD de itens de expedição (mesmas regras, status `SOLICITADA`, item não separado) | ADICIONADO | `expedicoes.service/controller` |
| `validarProdutoDoRecebimento/deExpedicao(depositante, produto)` aplicado também em `create`/`criarAutomaticoDeViagem` | MELHORADO | `recebimentos.service`, `expedicoes.service` |
| `ProdutosRepository.findByIds` (lote de 100), `listMovimentacoesByFilter` com `produtoId`/`limit` | ADICIONADO | `produtos.repository`, `estoque.repository` |

## Shared (`packages/shared`)

| O quê | Tipo | Arquivo |
|---|---|---|
| `AddRecebimentoItemSchema`/`UpdateRecebimentoItemSchema` (refine: ao menos um campo) | ADICIONADO | `entities/recebimento.ts` |
| `AddExpedicaoItemSchema`/`UpdateExpedicaoItemSchema` | ADICIONADO | `entities/expedicao.ts` |
| `TIPOS_MOVIMENTACAO_MANUAL`, `MovimentacaoManualEstoqueSchema` (superRefine: origem/destino por tipo, origem≠destino), `SaldoEstoqueSchema` | ADICIONADO | `entities/estoque.ts` |

> Atenção: `@rigabras/shared` é consumido via `dist` — rodar `pnpm --filter @rigabras/shared run build` após editar schemas.

## Web (`apps/web`)

| O quê | Tipo | Onde |
|---|---|---|
| Badge da fila offline no header (pendentes/falhas + retry `tentarNovamenteFalhas`) | ADICIONADO | `components/layout/OfflineQueueIndicator.tsx`, `DashboardLayout.tsx` |
| Logout purga a fila **do usuário que sai** (`purgeQueueDoUsuario(uid)`, uid capturado antes de limpar token) — tradeoff: perde trabalho offline não sincronizado | MELHORADO (decisão autônoma) | `offline/db.ts`, `logout` |
| Página **Estoque** (`/wms/estoque`): saldos por endereço, entrada/saída/transferência por linha, movimentação avulsa ("Nova movimentação"), histórico do ledger, busca com debounce | ADICIONADO | `pages/EstoqueListPage.tsx`, `hooks/useEstoque.ts`, `App.tsx`, `WmsKpiPage.tsx` |
| Checklist de **entrada**: adicionar/editar/remover itens do recebimento enquanto `AGUARDANDO` (SKU do produto no card) | ADICIONADO | `RecebimentoDetailPage.tsx`, `hooks/useRecebimentos.ts` (`useRecebimentoItens`) |
| Checklist de **saída**: adicionar/editar/remover itens da expedição enquanto `SOLICITADA` | ADICIONADO | `ExpedicaoDetailPage.tsx`, `hooks/useExpedicoes.ts` (`useExpedicaoItens`) |
| **Edição de produto** (SKU, descrição, UM, peso, volume, ativo) com badge Ativo/Inativo | ADICIONADO | `ProdutosListPage.tsx`, `hooks/useProdutosArmazenados.ts` (`useUpdateProduto`) |

---

## Leva CORREÇÕES 0.5 (WMS + frota — pedido direto do usuário)

### WMS (Módulo 5)

| O quê | Tipo | Onde |
|---|---|---|
| Submenu compartilhado do WMS em todas as 14 telas (`aria-label="Seções do WMS"`, `data-testid="wms-subnav"`): Painel/Depositantes/Produtos/Recebimentos/Expedições/Estoque/Redes/Mapa/Avarias | ADICIONADO | `components/WmsSubNav.tsx` + 14 páginas; nav local removida da `WmsKpiPage` |
| Produtos com `codigo` (**PROD-######** gerado no servidor, único entre ativos, retry 5× em `ConflictError`) e `numero_produto` informado pelo usuário | ADICIONADO | `entities/produtoArmazenado.ts`, `produtos.repository/service`, `pgErrors.ts`, fake DB |
| "+ Adicionar novo..." nos selects que faltavam: Estoque (produto/destino) e itens da expedição (produto/endereço), com modal `cadastro-rapido` e reload da lista após criar | ADICIONADO | `EstoqueListPage.tsx`, `ExpedicaoDetailPage.tsx` |
| Painel **Redes dos veículos** (`/wms/redes`): cadastro com código **RED-######** (server-side), condição NOVA/BOA/REGULAR/RUIM, validade, "padrão cliente", KPIs com auto-refresh (20s), retirada (cliente+veículo) e devolução, exclusão bloqueada enquanto `EM_TRANSITO` | ADICIONADO | `redes.{repository,service,controller}.ts`, `wms.routes.ts`, `RedesListPage.tsx`, `hooks/useRedes.ts`, badges `RedeStatusBadge`/`RedeCondicaoBadge`, rota em `App.tsx` |

### Frota (Módulo 4)

| O quê | Tipo | Onde |
|---|---|---|
| Solicitação de manutenção com **hora (HH:MM)**, **solicitante** (server-set a partir do token, exibido como somente-leitura) e **fotos opcionais** (até 5, reduzidas no cliente a ≤500 KB, data URLs) | ADICIONADO | `entities/manutencaoVeiculo.ts`, `frota.repository/service/routes` (`bodyLimit` 3 MB), `ManutencaoFormPage.tsx`, `lib/imagens.ts` |
| Manutenções listando **data da solicitação**, hora, solicitante, **tempo decorrido** e badge de **previsão da próxima** (vencida/hoje/≤7d) | ADICIONADO | `ManutencoesListPage.tsx`, `ManutencaoDetailPage.tsx` |
| **CRUD de veículos** (`/frota/veiculos`, `/nova`, `/:id`): busca, mostrar inativos, exclusão soft delete + item "Veículos" no menu lateral | ADICIONADO | `VeiculosListPage.tsx`, `VeiculoFormPage.tsx`, `useVeiculos.ts`, `DashboardLayout.tsx`, `App.tsx` |

### Migrations (REQUER VALIDAÇÃO EXTERNA — sem Postgres local)

| Migration | Conteúdo |
|---|---|
| `0019_correcoes_05_produtos_manutencoes.sql` | `produtos_armazenados.codigo`/`numero_produto` + índices únicos parciais + backfill `PROD-######`; `manutencoes_veiculo.hora` (text HH:MM, contrato do Zod), `solicitante_id`/`solicitante`, `fotos jsonb` (máx. 5) |
| `0020_redes_veiculos.sql` | enums `condicao_uso_rede`/`status_rede`/`tipo_movimentacao_rede`, tabelas `redes` (unique `codigo`, check trânsito→veículo) e `rede_movimentacoes` (append-only), RLS no padrão da migration 0006 |

> Nenhuma das duas toca a migration **0018** (permanece livre; **REQUER DECISÃO**).

### Correções de encoding

| O quê | Tipo | Onde |
|---|---|---|
| Comentários `/** ... */` com U+FFFD/acentos quebrados reescritos (5 páginas do WMS) | CORRIGIDO | `AvariasListPage`, `DepositantesListPage`, `ExpedicoesListPage`, `RastreioProdutoPage`, `RecebimentosListPage` |
| Scan `U+FFFD` no repositório (fontes, excluindo binários): **negativo** | VERIFICADO | — |

## Ferramentas / CI (Fases 15–16)

| O quê | Tipo | Onde |
|---|---|---|
| ESLint real em flat config (ESLint 10 + `typescript-eslint` + `eslint-plugin-react-hooks` + `globals` como devDependencies da raiz): `js.configs.recommended` + `tseslint.configs.recommended`, regras clássicas de React Hooks só em `apps/web`, ignores de `dist`/`docs`/protótipo legado `gestão-de-frotas-&-viagens/`/`*.cjs` | ADICIONADO | `eslint.config.mjs` |
| Scripts `lint` reais no lugar dos placeholders (`pnpm lint` → `eslint .` na raiz; `eslint src` em api/web/shared) | CORRIGIDO | `package.json`, `apps/api/package.json`, `apps/web/package.json`, `packages/shared/package.json` |
| Ajustes de código apontados pelo lint (sem mudança de comportamento): `let` sem inicialização inútil em `idempotency.ts` e `consolidacao.ts`; 2 `eslint-disable` não usados removidos em `env.ts` | CORRIGIDO | `apps/api` |
| Step **Lint** no job `verify` da CI | ADICIONADO | `.github/workflows/ci.yml` |
| Job **`e2e`** na CI: `needs: verify` (não gasta runner se typecheck/build já falharam), Playwright chromium com `--with-deps`, suíte com `--retries=1` (absorve o flaky 10/11/12), env dummy para o Zod do `env.ts` + `USE_FAKE_DB=true`, upload de `playwright-report/` e `test-results/` em falha | ADICIONADO | `.github/workflows/ci.yml` |
| `pnpm lint` verde: **0 erros, 29 warnings** (aceitáveis: `no-console` em scripts, escapes/regex de sanitização, whitespace em strings de importação) | VERIFICADO | — |

> O job `e2e` usa banco em memória (sem Docker no runner) e envs dummy — mesmas ressalvas do E2E local: RLS/migrations continuam sem verificação contra Postgres real.

## Testes

| O quê | Tipo | Onde |
|---|---|---|
| 6 testes do `EstoqueService` (saldo insuficiente, produto/endereço inexistentes, ledger com documento, enriquecimento de saldos, limit de movimentações) | ADICIONADO | `apps/api/src/modules/wms/estoque.service.test.ts` |
| E2E `17-wms-estoque-manual.spec.ts`: entrada avulsa → saldo; saída parcial → saldo atualizado; histórico do ledger; edição de produto pela tela | ADICIONADO | `tests/e2e/` |
| E2E `18-wms-redes.spec.ts`: cria rede (código gerado), KPIs, retirada com veículo → `EM_TRANSITO` + exclusão bloqueada, devolução → `DISPONIVEL`, filtros de busca/condição | ADICIONADO | `tests/e2e/18-wms-redes.spec.ts` |

## Regressão (estado final desta execução)

- `pnpm -r run typecheck` · **verde** (shared, api, web)
- `pnpm lint` · **verde** (0 erros, 29 warnings)
- `pnpm --filter @rigabras/api run test` · **137 passed** (13 arquivos)
- `pnpm exec playwright test` · **45 specs**: 42 passed na suíte completa (~17 min); as 3 falhas (`10-acompanhamento`, `11-importacao-planilha-completa`, `12-usuarios-categorias`) são **flaky de tempo limite sob carga** — cada uma passa isolada (reexecução individual **2–4 passed**) e não regridem comportamento da leva 0.5.

## Não alterado (mantido propositalmente)

- Migration 0018 (UNIQUE `recebimentos.viagem_id`) — **REQUER DECISÃO** (risco de duplicatas).
- RBAC × RLS de VISITANTE — **REQUER DECISÃO** (AUDIT §8.2).
- RPCs `SECURITY DEFINER`/concorrência/RLS real — **REQUER VALIDAÇÃO EXTERNA** (Postgres real).
- `concluirConferencia` transiciona sem `assertTransicao` (incoerência conhecida, não alterada).
