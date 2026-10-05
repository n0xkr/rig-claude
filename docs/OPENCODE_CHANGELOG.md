# CHANGELOG — OPENCODE_CHANGELOG

Registro das mudanças entregues na execução do `OPENCODE_EXECUTION_PLAN.md` (base `dbc2af6`). Contratos/Zod/RBAC/RLS/ledger imutável/fila offline preservados; nenhuma migration nova escrita.

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

## Testes

| O quê | Tipo | Onde |
|---|---|---|
| 6 testes do `EstoqueService` (saldo insuficiente, produto/endereço inexistentes, ledger com documento, enriquecimento de saldos, limit de movimentações) | ADICIONADO | `apps/api/src/modules/wms/estoque.service.test.ts` |
| E2E `17-wms-estoque-manual.spec.ts`: entrada avulsa → saldo; saída parcial → saldo atualizado; histórico do ledger; edição de produto pela tela | ADICIONADO | `tests/e2e/` |

## Regressão (estado final desta execução)

- `pnpm -r run typecheck` · **verde**
- `pnpm --filter @rigabras/api run test` · **137 passed** (131 base + 6 novos)
- `pnpm exec playwright test` · **43 passed** (41 base + 2 novos)

## Não alterado (mantido propositalmente)

- Migration 0018 (UNIQUE `recebimentos.viagem_id`) — **REQUER DECISÃO** (risco de duplicatas).
- RBAC × RLS de VISITANTE — **REQUER DECISÃO** (AUDIT §8.2).
- RPCs `SECURITY DEFINER`/concorrência/RLS real — **REQUER VALIDAÇÃO EXTERNA** (Postgres real).
- `concluirConferencia` transiciona sem `assertTransicao` (incoerência conhecida, não alterada).
