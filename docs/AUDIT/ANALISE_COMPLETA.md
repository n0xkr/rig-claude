# Análise Completa — rig-claude (Rigabras TMS + WMS)

Data: 2026-10-02 · Fase: **somente análise** (nenhum código foi alterado).
Método: quatro auditorias paralelas de leitura de código (API núcleo/segurança, módulos de negócio, frontend/offline, banco/testes/DevOps), consolidadas aqui.
Itens marcados **(não verificado)** ou **(inferido)** não foram confirmados em execução. Nenhum teste, build ou consulta ao banco vivo foi executado nesta fase.

---

## 1. Resumo executivo

Sistema monorepo pnpm (≈48,5 mil LOC TypeScript: API ≈21,9 mil, web ≈19,6 mil, shared ≈4,3 mil + 16 migrations SQL). Camadas bem definidas na maior parte da API (routes → controller → service → repository), zero `any` explícito em API e web, Zod nas fronteiras, RFC 7807, rate limit, helmet, JWT com algoritmo fixado, lazy loading completo no web.

Os maiores riscos **não estão na estrutura, e sim em quatro pontos**:

1. **Integridade transacional**: toda a lógica multi-passo (estoque, expedição, recebimento, inventário, frete, viagem, jornada, importação) faz escritas sequenciais pelo `supabaseAdmin` **sem transação nem lock**. Há perda de atualização, ledger divergente do saldo e duplicações em retry.
2. **Segredos e dados sensíveis na pasta do projeto** (sincronizada pelo OneDrive): tokens em `.mcp.json`, `.env` em pasta não rastreada, backup de importação com PII, planilha real rastreada no git.
3. **Autenticação/exposição**: `trustProxy: true` por padrão (anula rate limit), refresh token sem revogação, autocadastro aberto por padrão, VISITANTE lê dados financeiros e PII (API e RLS), chatbot sem limite de custo.
4. **Zero verificação automatizada de banco/RLS e ausência de CI**: testes rodam só contra `fakeSupabase` em memória; não há pipeline antes do deploy.

### Top 12 prioridades

| # | Ação | Risco |
|---|------|-------|
| 1 | Rotacionar tokens do `.mcp.json` (Supabase Management e Coolify) e tirá-los do OneDrive | Crítico |
| 2 | `trustProxy`: padrão `1`/`false`, obrigatório em produção; lockout por conta | Crítico |
| 3 | RPCs transacionais com lock para ledger de estoque, expedição, recebimento, inventário (A1–A5) | Crítico |
| 4 | Validar placeholders de segredos em produção (`your-*-here`), segredos JWT distintos, `iss/aud` | Alto |
| 5 | Refresh token rotativo com `jti` persistido e revogação | Alto |
| 6 | Fechar signup público (Supabase Auth + `ALLOW_PUBLIC_REGISTRATION=false`) e tirar VISITANTE de dados financeiros/PII | Alto |
| 7 | Policy `fretes_update` permite OPERADOR reabrir frete PAGO via PostgREST; trigger de transição | Alto |
| 8 | Financeiro do frete: update condicional por status, limite de pagamento ≤ saldo | Alto |
| 9 | Idempotency-Key na fila offline + visibilidade de falhas + fila por usuário | Alto |
| 10 | Exportação ERP trunca em 1000 linhas silenciosamente; N+1 | Alto |
| 11 | CI (typecheck, build, vitest, e2e) antes do deploy Coolify; teste de RLS em Postgres real | Alto |
| 12 | Higiene do repo: gitlink de worktree, planilhas/binários, pasta `gestão-de-frotas-&-viagens/` | Médio |

---

## 2. Inventário

### 2.1 Estrutura

| Item | Conteúdo |
|------|----------|
| `apps/api` | Fastify 5, TypeScript. `src/{app,server}.ts`, `config/`, `lib/`, `middleware/`, `routes/index.ts`, `modules/` (24 módulos + `wms/*` + `importacao/inteligente/`), `scripts/` (5 scripts), Dockerfile, `.env.example` |
| `apps/web` | React 19 + Vite 5 + Tailwind 3 PWA (vite-plugin-pwa), ≈45 páginas lazy, ≈38 hooks, 3D (three vanilla + r3f), IndexedDB para fila offline, nginx.conf, Dockerfile |
| `packages/shared` | Zod schemas/entidades (38 arquivos), `enums.ts` (642 LOC), permissões, `planilhaScan.ts`, `planilhaModelo.ts` |
| `supabase/` | 16 migrations contíguas (0001–0016), `seed.sql` (desatualizado). Sem `config.toml` |
| `tests/e2e` | 11 specs Playwright (o relatório do subagente de banco citou 16; contagem git: 11) |
| Testes unitários | 9 arquivos vitest, todos na API |
| Scripts | `apps/api/scripts/*.mjs/.ts` (reset, arquivar, mesclar, padronizar, simular importação); `scripts/*.py` (2, legado) |
| CI/CD | **Inexistente** (`.github/` não existe). Deploy via Coolify direto de `master` (segundo memória do projeto) |
| Docker | `apps/api/Dockerfile` (node:22), `apps/web/Dockerfile` (node:20). Sem `.dockerignore` |
| `.claude/` | `launch.json` (ok) e gitlink de worktree de agente rastreado por engano |
| Integrações externas | Supabase (Auth, Postgres, Storage), Groq (LLM/OCR/chatbot), Coolify (deploy), ERP (adapter CSV/JSON interno) |

### 2.2 Arquivos maiores (hotspots de complexidade)

| Arquivo | LOC |
|---|---|
| `api/.../importacao/inteligente/consolidacao.ts` (função `consolidar` ≈845 linhas) | 1112 |
| `web/pages/SolicitacoesIaPage.tsx` | 1037 |
| `web/pages/UsuariosPage.tsx` | 838 |
| `web/pages/AcompanhamentoPage.tsx` | 827 |
| `api/.../iaSolicitacoes/analisador.ts` | 736 |
| `shared/planilhaScan.ts` | 662 |
| `web/pages/ViagemFormPage.tsx` | 658 |
| `api/.../iaSolicitacoes/entidades.ts` | 652 |
| `shared/enums.ts` | 642 |
| `web/pages/MotoristaFormPage.tsx` | 611 |

### 2.3 Órfãos, mortos e redundantes

| Arquivo / símbolo | Situação |
|---|---|
| `web/hooks/useImportacao.ts` | Órfão (nenhum import) |
| `web/hooks/useInventarios.ts` | Órfão. Não há página de inventário roteada, embora API e shared tenham o módulo |
| `web/offline/syncManager.ts` → `queueUpdateViagem`, `onQueueChange` | Exports sem uso (kind `update-viagem` em `db.ts` também) |
| `web/public/manifest.json` | Redundante com o manifest gerado pelo VitePWA |
| `api/middleware/validate.ts` → `assertRequest` | Função vazia |
| `api/lib/pgErrors.ts`, `lib/pgConstraintErrors.ts`, `modules/wms/pgErrors.ts` + `mensagemErroBanco` + `msgErro` | 5 implementações da mesma ideia |
| `api/lib/schemaPendente.ts` vs `lib/permissoes.ts` | `isSchemaAusente` duplicado |
| `handleDomainError` | 24 cópias (13 controllers + 8 do WMS + outros) |
| `uuid`, `@types/uuid` (API) | Não importados |
| `REDIS_URL` | Declarado, nunca usado |
| `scripts/analisar_planilha.py`, `auditar_importacao.py` | Legado provável, fora do pipeline TS |
| `iaSolicitacoes/sugestaoIa.ts`, `leitura.ts` | Uso não verificado integralmente |
| `.claude/worktrees/agent-…` | Gitlink (modo 160000) sem `.gitmodules` |
| `gestão-de-frotas-&-viagens/` (não rastreado) | Projeto externo com `node_modules`, `.env`, cópias de planilhas |
| Raiz: `348s.jpg`, `Gemini_Generated_*.jpg`, `LOGO RB.jpg`, `RIGABRAS_Controle_GR.xlsx`, `Resumo Rigabras.pdf`, `Rigabras_Diagnostico.pptx`, `backup-reset-importacao-*.json` | Binários/dados fora de `docs/`; xlsx e imagens rastreados |

---

## 3. Arquitetura real

```
Browser (React PWA)
  └─ apiClient (fetch + refresh) ──► /api/v1
        server.ts → app.ts (helmet, cookie, rate-limit, CORS manual, correlationId, /healthz /readyz, error handlers)
          └─ routes/index.ts → registrarModulo() aplica requireModulo (claim `mods`)
               └─ modules/<x>: routes → controller → service → repository
                    └─ supabaseAdmin (SERVICE-ROLE, ignora RLS)
```

- Autenticação: senha validada no Supabase Auth; a API emite JWT HS256 próprio (15 min; `sub`, `email`, `role`, `mods`) e refresh em cookie httpOnly (7 dias). Papel/permissões só são relidos no refresh.
- **Todo controle de acesso real está na API**, porque ela usa service-role. A RLS é segunda linha (e só vale para acesso direto via anon key/PostgREST).
- O web usa Supabase direto **somente** para `uploadToSignedUrl` (token assinado pela API) em `usePortaria.ts`. Boa decisão.

### Violações de camada

| Local | Problema | Impacto | Recomendação |
|---|---|---|---|
| `auth`, `usuarios`, `perfil`, `categorias`, `adminDados` | Sem repository; service acessa Supabase direto | Menos testável | Criar repositories |
| `camposPersonalizados.routes.ts:19-35` | Consulta ao banco dentro da rota; `throw error` com PostgrestError cru; `limit(5000)` | Camada quebrada; erro pode vazar como 500 cru | Mover para repository, `DomainError` |
| `wms/estoque.repository.ts:161-176` | Regra "saldo insuficiente" e `sincronizarStatusEndereco` no repository | Regra de negócio fora do service | `EstoqueService` + repo burro |
| `motoristas/motoristas.documentos.ts` (297 L) | Serviço + repository + OCR/IA no mesmo arquivo; DB direto | Acoplamento | Separar |
| `importacao/inteligente/inteligente.service.ts` `gravar` | Acessa `supabaseAdmin` direto no service | Idem | Repository |
| `erpExport/internalCsvJsonAdapter.ts` | `supabaseAdmin` direto no adapter, duplica queries de fretes | Aceitável por ser adapter, mas duplica | Reusar repositories |
| Web: 10 páginas/componentes chamam `api.*` direto (UsuariosPage, MotoristaFormPage, GerenciarDadosPage, AcompanhamentoPage, ViagemDetailPage, ViagemFormPage, ViagensListPage, CadastroRapido, ImportacaoInteligente, DashboardLayout) | Pula a camada de hooks | Duplica tratamento de `ApiError`; difícil testar | Extrair hooks |
| Web: `lib/viagemGrupos.ts`, `StatusBadge.tsx`, `CadastroRapido` (`def.montar`) | Regras de status/payload no cliente | Drift com a máquina de estados da API | Mover mapas para `@rigabras/shared` |

Dependências circulares: não foram investigadas com ferramenta (ex.: madge). **(não verificado)**

---

## 4. Achados — Segurança e plataforma (API núcleo)

### CRÍTICO

**S1. Tokens reais em `.mcp.json`** — `.mcp.json` (raiz, não rastreado, no `.gitignore`; sem histórico no git).
Contém token de Management API do Supabase e token do Coolify com IP da VPS, em texto claro, em pasta sincronizada pelo OneDrive. O primeiro dá controle da conta Supabase (chaves service-role, SQL); o segundo, do deploy.
Melhoria: rotacionar ambos agora; usar variáveis de ambiente; mover o projeto/arquivo para fora do OneDrive; fixar versões (`npx -y …@latest` executa código arbitrário).

**S2. `.env` real em pasta não rastreada** — `gestão-de-frotas-&-viagens/.env` (+ `firebase-applet-config.json` com apiKey Firebase, `node_modules`, cópias de planilhas). Um `git add .` captura se o ignore local falhar. Melhoria: ignorar/mover a pasta; rotacionar service-role e chave Groq se houve compartilhamento.

**S3. `trustProxy` padrão `true`** — `app.ts:27` (`env.TRUST_PROXY_HOPS ?? true`), `.env.example:82` vazio.
Atacante gira `X-Forwarded-For` e contorna o rate limit (5/min em `/auth/login` e `/auth/register`, 100/min global) → brute-force; `audit_logs.ip` fica falsificável.
Melhoria: padrão `1`/`false`; falhar o boot em produção sem o valor; lockout por e-mail.

### ALTO

**S4. Refresh token sem revogação/rotação** — `auth.service.ts:147-177` (`issueSession`, `refresh`), `auth.controller.ts:87-90` (`logout`). `jti` é gerado e nunca armazenado; logout só limpa o cookie; refresh roubado vale 7 dias. README fala em "refresh rotativo" (enganoso). Melhoria: tabela `refresh_tokens(jti, user_id, expires, revoked)` com uso único e revogação de família.

**S5. `/auth/refresh` e `/auth/logout` sem rate limit próprio** (`auth.routes.ts:15-16`). Melhoria: 20/min por rota.

**S6. Autocadastro público habilitado por padrão** — `env.ts:86-89`, `.env.example:84`. Sem verificação de e-mail (`email_confirm: true`); senha sem `max`. VISITANTE já lê muita coisa (ver S17/D3). Melhoria: padrão `false`; se mantido, confirmar e-mail e limitar senha a 72 caracteres.

**S7. Segredos de exemplo aceitos em produção** — `env.ts:57-61` (`min(16)`): `your-jwt-access-secret-here-change-me` (37 chars) passa; `SUPABASE_*` `min(1)` aceita placeholders; segredos access/refresh podem ser idênticos; sem `iss/aud`; `loadDotEnv` é parser caseiro (sem `export`, CRLF, comentários inline). Melhoria: rejeitar placeholders, exigir ≥32 chars distintos, `SUPABASE_URL` como URL, usar `node --env-file`/`dotenv`.

**S8. Chatbot expõe dados a qualquer papel, sem limite de custo** — `chatbot.routes.ts:5,10`, `chatbot.service.ts:25-85` (`montarSnapshot`). Snapshot (financeiro pendente, motoristas com alertas, placas) vai à Groq e volta a VISITANTE/PORTARIA; `mods == null` libera tudo (`auth.ts:104`); sem rate limit próprio; 8 queries por pergunta, incluindo `select('status')` sem limite. Melhoria: filtrar snapshot por papel/módulo; limite por usuário/dia; `count` em SQL.

**S9. Prompt injection (Médio)** — `groq.client.ts:57-67,123-134,156-165`. `pergunta` e textos livres (`eventos_risco.descricao`, origem/destino, vindos até de planilha) entram direto no prompt; saída do chatbot não validada. Mitigado por: modelo sem tools; JSON passa por Zod. Melhoria: delimitar dados, truncar/escapar, tratar `reasoning` como texto na UI.

**S10. `adminDados` (CRUD genérico SUPERADMIN)** — pontos positivos: whitelist de tabelas, regex em `:tabela`, colunas validadas pelo OpenAPI, `escaparBusca`, proteção `__proto__`.
Problemas: (a) se o OpenAPI falha ou a tabela está vazia, **qualquer chave é aceita** (`service:226`) — falha aberta; (b) `query.or(...ilike.*${q}*)` sem remover `.`, `:`, `"` (manipulação de filtro PostgREST); (c) id não-uuid → 22P02 devolvido como 422 com `error.message` bruto; (d) `writeAuditLog` grava a linha inteira (CNH, CPF, telefone) em `audit_logs.changes_json`; (e) permite apagar definitivamente ledgers que deveriam ser imutáveis (`movimentacoes_estoque`, `registros_jornada`, `status_*_historico`, `import_datasets`) e editar `fretes/pagamentos_frete` sem segregação; (f) `Celula` aceita `record/array` sem limite de profundidade; (g) select + update/delete em duas etapas (corrida); (h) cache de metadados global, TTL 5 min.
Melhoria: falhar fechado (503), blacklist de colunas (`created_by`, `id`), ledgers somente leitura, auditar só campos alterados com máscara de PII.

**S11. Auditoria: acesso por e-mail com default pessoal** — `env.ts:77` (`AUDITORIA_EMAILS` default `otavio@otavio.com`), regra duplicada em `perfil.service.ts:8-13`; e-mail vem do JWT (stale até 15 min); lista `*` com `changes_json` e IP sem máscara. Com autocadastro aberto, quem registrar esse e-mail (e for ADMIN/SUPERADMIN) lê a trilha. Melhoria: sem default; usar `user_id`; centralizar em `lib/permissoes.ts`.

**S12 (bug). `register` retorna 500 em vez de 403** — `auth.controller.ts:34-39`: `DomainError(...,403)` cai em `Problems.internal`.

### MÉDIO

- **S13** `middleware/auth.ts:26-58`: payload JWT convertido com `as AccessTokenPayload` sem validar (role/sub); `mods == null` = sem restrição (fail-open para usuário sem categoria); `requireModulo` retorna cedo se não houver user; rotas só com `authenticate` ficam abertas a qualquer autenticado (`camposPersonalizados` GET, `perfil`, e `motoristas` precisa confirmação). Melhoria: Zod no payload, menor privilégio como padrão, teste de contrato "nenhuma rota sem guarda".
- **S14** `usuarios.service.ts` (`update` 194-245, `remove` 254-297, `create` 90-146): troca senha no Auth **antes** de checar que o profile existe/não está deletado; sem proteção do último SUPERADMIN ativo; exclusão lógica detectada por regex da mensagem do Supabase; auditoria gravada depois, sem atomicidade. Melhoria: verificar primeiro; impedir remover/rebaixar o último SUPERADMIN; código `23503` em vez de regex.
- **S15** CORS manual (`app.ts:52-64`): origem única, sem `Vary`, 429 sem CORS (browser mostra erro de CORS), sem `Max-Age`, default `localhost` em produção. Melhoria: `@fastify/cors` antes do rate-limit; `WEB_ORIGIN` obrigatório.
- **S16** Dockerfiles: `pnpm install --frozen-lockfile || pnpm install` mascara divergência; runtime da API sem `pnpm-lock.yaml`, então produção instala sem lockfile; sem `.dockerignore`; Node 22 (API) vs 20 (web); sem digest.
- **S17** `nginx.conf`: sem CSP e sem HSTS (token em localStorage torna CSP a defesa principal — **Alto** no web); headers incompletos em `/assets/` e SW; `SameSite=Strict` no cookie só funciona se web e API estiverem no mesmo site (confirmar domínios).
- **S18** Logs com PII: `auditLog.ts:28` loga `entry` completo; `app.ts:73-77,127-135` loga erro Postgrest bruto; `groq.client.ts` loga 200 chars de resposta (CNH/OCR); sem `redact` no pino; dois loggers.
- **S19** `fakeSupabase*.ts` no bundle de produção (`config/supabase.ts:3-4`); `NODE_ENV` tem default `development`, então esquecer a variável em produção permite `USE_FAKE_DB` e vaza `error.message`. Melhoria: `NODE_ENV` obrigatório, import dinâmico, excluir do build.
- **S20** `perfil`: avatar em data URL (até 210 KB) dentro de `profiles`, retornado em todo `GET /perfil`; regex não valida conteúdo real; comentário cita `bodyLimit` não configurado.
- **S21/22** `throw error` com PostgrestError cru em vários repositories (auditoria, chatbot, fretes, jornada, portaria, frota). **Cursor da auditoria usa `id` (uuid v4) com `order('id')`: ordem "mais recente" é aleatória e o cursor perde/duplica registros** (`auditoria.repository.ts`). `select('*, user:profiles(...)')` expõe e-mail de todos.

### BAIXO

Hooks `onRequest` sem `return reply` (`app.ts:60-62`, `auth.ts:28-40`); `void/await Problems.*` desnecessário; `DomainError(…,500,error.message)` devolve mensagem do Postgres (`auth.controller`, `usuarios.service`, `categorias`, `adminDados`); enumeração de contas no login (403 vs 401) e `register` (409); cookie com `secure` lendo `process.env` direto, `maxAge` fixo, `COOKIE_SECRET` inútil (`signed` não usado); deps mortas, `pino-pretty` em `dependencies`, `groq-sdk ^0.7.0` antigo, `lint` placeholder; `buildApp` com ≈125 linhas; sem timeout de shutdown nem handlers de `unhandledRejection/uncaughtException` (`server.ts`); `/readyz` público expõe se Groq está configurada e consulta o banco a cada chamada; respostas autenticadas sem `Cache-Control: no-store`.

### Pontos positivos
JWT com `algorithms: ['HS256']` e `type: 'refresh'` checado; `perfil` sem IDOR; schemas `strict`; cookie httpOnly/SameSite=Strict/path restrito; cliente de senha isolado do service-role; allowList do rate limit só fora de produção; `USE_FAKE_DB` bloqueado com `NODE_ENV=production`; container API não-root; **0 `any` explícito**.

---

## 5. Achados — Módulos de negócio (API)

### CRÍTICO / ALTO

**N1. Ledger de estoque não atômico** — `wms/estoque.repository.ts`: `registrarMovimentacao` (l.153-209), `aplicarDeltaSaldo` (l.212-242), `sincronizarStatusEndereco`.
Faz `getSaldo` → INSERT no ledger → SELECT saldo → UPDATE/INSERT `estoque` → atualiza endereço (4–6 round-trips). Duas saídas concorrentes passam na checagem e uma sobrescreve a outra; falha entre INSERT e UPDATE diverge ledger e saldo; `Math.max(0, saldo + delta)` (l.226) esconde inconsistência; INSERT concorrente pode dar 23505.
Melhoria: RPC `registrar_movimentacao(...)` transacional, `SELECT … FOR UPDATE`, `UPDATE … WHERE quantidade + delta >= 0`; remover `Math.max`. **Risco: Crítico.**

**N2. Regra de negócio no repository** (mesma classe, l.161-176): "Saldo insuficiente" e delta. `calcularDeltaSaldo` em `estoqueLedger.ts` já é puro e testado — bom ponto de partida para `EstoqueService`.

**N3. Expedição: escritas múltiplas sem lock** — `wms/expedicoes.service.ts`.
`separarItem` (179-234) baixa saldo antes de `updateItem` (dois requests = baixa dobrada; falha no update deixa saldo baixado e item "não separado"); `expedir` (309-343) e `cancelar` (351-374) fazem loop de movimentações e só no fim atualizam status (retry duplica eventos/estornos → estoque inflado); `transicionar` (97-118) sem `WHERE status = atual`; `marcarReembalagemEtiquetagem` (237-282) não valida status (permite em expedição CANCELADA/EXPEDIDA). **Risco: Alto/Crítico.**
Melhoria: RPC por operação; claim atômico `UPDATE … WHERE status=:esperado RETURNING`; unique de idempotência `(expedicao_id, item_id, tipo)` no ledger.

**N4. Recebimento com ordem invertida** — `wms/recebimentos.service.ts` `conferirItem` (168-227): `updateItem(quantidade_conferida)` (l.194) roda **antes** do ledger (l.201); se o ledger falhar, o item fica "conferido" sem entrada em estoque e o reenvio é bloqueado. `create` cria cabeçalho e depois itens (recebimento sem itens se falhar); `criarAutomaticoDeViagem` (95-137) tem TOCTOU `findByViagemId` → `create` (falta unique parcial em `recebimentos.viagem_id` — **não verificado no schema**).

**N5. Inventário** — `wms/inventarios.service.ts`: `create` (41-71) não atômico e sem paginação (trunca em 1000); `reconciliar` (137-194) compara com o **snapshot**, não com o saldo atual (movimentação entre snapshot e reconciliação gera ajuste errado), loop sem transação (retry duplica ajustes); estoque em endereço sem snapshot não pode ser contado; `contarItem` lista todos os itens a cada contagem (O(n)).

**N6. Frete (dinheiro)** — `fretes/fretes.service.ts`: `changeStatus` (142-204) sem `WHERE status_fechamento = atual`, histórico e audit em escritas separadas; `createPagamento` (319-341) **não valida `valor_pago <= saldo`**, sem idempotência, check de APROVADO e insert não atômicos; lançamento (desconto/multa) em frete APROVADO muda o saldo após a aprovação (`createLancamento` só bloqueia PAGO). `computeSaldo` faz 3 queries por chamada.

**N7. Viagens** — `viagens/viagens.service.ts`: `create` (93-133) → `replaceCargas` → histórico → audit (falha deixa viagem sem cargas); `update` (135-192) com `replaceCargas` = DELETE+INSERT não atômico (`viagens.repository.ts:131-144`; falha após o DELETE apaga todas as cargas), sem lock otimista; `changeStatus` (215-272) sem condição de status atual (histórico incoerente); `sincronizarRecebimentoAutomatico` (282-315) relança erro **depois** do status gravado (cliente vê 500, retry dá "Status inalterado"); `softDelete` (336-347) não verifica dependentes (frete, expedição, recebimento, portaria, jornada).

**N8. Exportação ERP** — `erpExport/internalCsvJsonAdapter.ts`: `exportFinanceiro` (29-52) com `computeSaldo` em loop (N+1, ≈4 queries por frete); `listarFretesNoPeriodo` (54-64) e `exportEstoque` (72-83) **não paginam: PostgREST trunca em 1000 sem erro** → arquivo financeiro/inventário incompleto sem aviso; `.in('id', ids)` sem lote; filtro de datas em UTC enquanto o sistema usa -03:00 (`fetchAllPages.periodoInicioTs`). Sem rate limit e sem audit de quem exportou.

**N9. Importação inteligente** — `importacao/inteligente/inteligente.service.ts`:
`gravar` (268-443, ≈175 linhas): gravação 1 a 1 em loops (milhares de round-trips num único request); sem transação; `viagem_cargas` = DELETE total + INSERT em lotes de 50 (falha no meio apaga cargas); inserts de `status_viagem_historico` (l.360,375) e `viagem_motorista_historico` (l.385) **não checam `error`**; status da planilha sobrescreve viagem sem máquina de estados (qualquer OPERADOR com módulo de importação); sem idempotência (duas importações duplicam clientes); auditoria só agregada.
`carregarBase` (47-72): `select('*')` de tabelas inteiras a cada chamada (inclusive na prévia); `.limit(20000)`/`.limit(10000)` truncados silenciosamente pelo PostgREST (falsos positivos em `cargasMudaram`, viagens sem `veiculo_id`).
Memória/DoS: `bodyLimit` 80 MB parseado como JSON inteiro (até 80 abas × 20.000 linhas), `validarVolume` só depois do parse+Zod; IA chamada em série dentro do request (timeout em `ia.ts` **não verificado**).
Melhoria: job assíncrono, upsert em lote, RPC transacional por viagem, checar `error` em toda escrita, multipart com streaming.

**N10. Importação genérica** — `importacao.service.ts`: `coagirEValidarLinhas` (140-253) cria `veiculo_stub` **antes** do `safeParse` (stubs órfãos); `importar` (271-320) grava linha a linha com `bulkInsert` de 1 elemento; sem transação.

**N11. Solicitações IA** — `iaSolicitacoes/iaSolicitacoes.service.ts` `aprovar` (183-223): sem claim atômico (dois admins gravam duplicado); `catch` (l.221) transforma qualquer erro, até falha de audit **após** o registro criado, em `status: 'ERRO'` (retry → 409/duplicação); `gravar` ATUALIZACAO (134-145) não roda `def.validar` nem Zod; `aprovarLote` até 500 em série.
Melhoria: `UPDATE … SET status='PROCESSANDO' WHERE status IN ('PENDENTE','ERRO') RETURNING *` como claim.

**N12. Upload de documentos do motorista** — `motoristas/motoristas.documentos.ts` `enviarDocumentos` (174-259): tamanho checado **depois** de decodificar base64 (bodyLimit 45 MB; 14 MB × 3 em memória); **MIME vem do cliente sem whitelist nem magic bytes** (`EXT[mime] ?? 'bin'`); upload e insert não atômicos (arquivo órfão); upsert de veículo a partir do CRLV direto em `veiculos` sem `VeiculosService`, e engole erro do update (l.236); `listarDocumentos` faz `createSignedUrl` por item (N+1) com URL de 1 h; `excluirDocumento` ignora erros; OCR envia CNH/CRLV a provedor externo (LGPD: base legal/consentimento), `OcrCnhSchema.parse` pode lançar `ZodError` → 500.

**N13. Portaria** — `portaria.service.ts`: URL assinada de upload sem limite de tamanho/MIME (e nenhum `file_size_limit`/`allowed_mime_types` em `supabase/` por grep); `anexarDocumento` aceita o mesmo `storage_path` duas vezes; `getKpis` (324-347) faz 4 `listEntradas` completos (`select('*, viagem:viagens(*)')`, sem filtro/paginação) só para contar `.length` (trunca em 1000); `listEntradas` sem limite; `registrarEntrada` (62-110) e `registrarSaida` (247-318) com escritas separadas; join `viagem:viagens(*)` expõe valor da mercadoria ao porteiro.

**N14. Jornada (ADI 5322, valor probatório)** — `jornada/jornada.service.ts` `registrarEvento` (33-67): `findUltimoEventoByMotorista` → `create` sem lock (dois INICIO_JORNADA); "último" por `timestamp_evento` vindo do **cliente** (retroativo/futuro quebra a ordem); `listMotoristaIdsAtivos` não pagina; `.in('motorista_id', todos)` estoura URL (frota já faz em lotes); `jornada.controller.ts:114` `Number(query.janelaDias)` sem Zod.

### MÉDIO

- **B1** `handleDomainError` copiado em 21+ controllers; handler global só trata erro PG, não `DomainError` → controllers de `importacao` (`analisar/validar/importar/listDatasets`) lançam `DomainError` que vira **500** em vez de 4xx. Cinco mapeadores de erro PG.
- **B2** Query/params sem Zod (`as {…}`): `viagens.controller.ts:31-32`, `apolices.controller.ts:26-27` (`Number(limit)` sem teto/NaN), `veiculos`, `motoristas`, `fretes`, `fronteira`, `jornada`, `portaria` (status livre) e **todo o WMS** (`limit=abc` → `.limit(NaN+1)`). Tetos inconsistentes (200/1000/sem teto). `:id` nunca validado como UUID.
- **B3** Listas sem paginação/truncamento silencioso: `portaria.repository.listEntradas`, `estoque.repository.listMovimentacoesByFilter` (KPIs), `wms/kpis.service.ts:115-128` (`limit: 1000`, `status as never`), `fronteira.repository`, `viagens.repository.listStatusHistory`. Use `fetchAllPages` (já existe) ou `count`/agregação SQL.
- **B4** N+1: `expedicoes.service.create` (58-61) e `recebimentos.service.create` (52-55) fazem `findById` por item; `fronteira.service.getKpis` (62-95) O(n²); `frota.service.ts:170` O(V×M); `jornada.getAlertas` sem teto.
- **B5** Funções gigantes: `consolidar` (l.260–≈1105, ≈845 linhas, uma função; teste de 238 linhas cobre pouco), `processarEntidade` (analisador.ts 249-455, ≈206), `gravar` (≈175), `interpretarArquivos` (≈110). Arquivos: `analisador.ts` 736, `entidades.ts` 652, `padronizacao.ts` 544, `dicionario.ts` 455, `interpretacao.ts` 446.
- **B6** Authz: VISITANTE lê CPF/CNH e URLs assinadas de documentos (`GET /motoristas/:id`, `/:id/documentos`) — LGPD; **VISITANTE lê lançamentos/pagamentos de frete** (`fretes.routes.ts:76-96`), inconsistente com `erpExport` (só ADMIN); `/importacoes/ia/analisar` (30 MB, chama IA externa) sem `rateLimit`; `mods` do JWT só atualiza após expirar (≤15 min); matriz de transição por papel em `fretes.service.ts:156-161` sem teste.
- **B7** Erros: `portaria.service.ts:276` cast para `.code`; repositórios lançam PostgrestError cru; falha de audit após mutação propaga 500 com mudança já gravada. Nenhuma promise solta encontrada nos módulos lidos.
- **B8** Casts: `ViagemRow = Record<string, unknown>` (patch sem tipagem), `status as never`, `as unknown as …` (`portaria.repository:37`, erpExport), `data as Viagem` em todos os repositories — faltam tipos gerados (`supabase gen types`).

### BAIXO
`wms/kpis.service.ts:104` usa saldo **atual** como `saldo_medio_periodo` (giro de estoque enganoso); `fronteira.registrarEtapa` não valida ordem/duplicidade/existência da viagem; `documentosEmbarque.update` permite alterar documento já validado; scripts de reset/arquivar/mesclar sem guard de ambiente nem restauração, helper `todas()` duplicado.

### Veredito por módulo

| Módulo | LOC | Veredito |
|---|---|---|
| viagens | 832 | Boa estrutura; falta atomicidade (N7) |
| fretes | 922 | Camadas OK; sem lock/limite de pagamento (N6) |
| frota | 665 | Bom (lotes, `fetchAllPages`); KPIs em memória |
| veiculos | 272 | Simples e correto |
| motoristas | 687 | Upload fraco + LGPD (N12) |
| jornada | 846 | Regras puras testadas; race no registro (N14) |
| fronteira | 297 | Fino, sem validação de etapas |
| portaria | 845 | Upload sem limite, KPIs caros (N13) |
| acompanhamento / apolices / documentosEmbarque / eventosRisco / validacaoPreEmbarque | 391/230/279/240/265 | CRUD fino, sem problemas graves |
| erpExport | 435 | N+1 + truncamento (N8) |
| wms/* | 3570 | **Maior risco do back-end** (N1–N5) |
| importacao/** | 4634 | Rico e parcialmente testado; gravação frágil (N9/N10) |
| iaSolicitacoes | 2458 | `aprovar` sem claim (N11) |

---

## 6. Achados — Frontend, PWA e offline

### ALTO
- **W1 Sem Idempotency-Key** — `offline/db.ts:10`, `syncManager.ts` (`sendMutation`, `trySync`). O comentário diz que `QueuedMutation.id` é a chave de idempotência, mas `api.post(path, payload)` não envia header. Falha entre POST aceito e `removeMutation` reenvia → viagem/frete/avaria duplicados; qualquer `TypeError` de fetch enfileira mesmo se o servidor já recebeu (`useViagens.ts:78-83`).
- **W2 Mutação "envenenada" presa em silêncio** — 4xx permanentes (422/403/409) gastam 5 tentativas e ficam "retidas" sem nenhuma tela; `onQueueChange` não é usado por ninguém; sem backoff (30 s fixo). Usuário acredita que salvou; dado nunca chega.
- **W3 Fila não escopada por usuário nem limpa no logout** — `DashboardLayout.tsx:210-226`, `db.ts`: mutações do usuário A saem com token do B (autoria/auditoria erradas; vazamento em dispositivo compartilhado).
- **W4 Sem CSP no nginx** (token em localStorage) — ver S17.

### MÉDIO
- Ordenação/dependência entre mutações (só `create-registro-jornada` serializado por motorista); `sync` roda antes do login e `encerrarSessao` pode redirecionar para `/login` no meio do uso; `syncing` é por aba (duas abas reenviam; usar `navigator.locks`); updates `update-frete` e `update-quilometragem-viagem` são last-write-wins sem versão/ETag.
- **Offline é parcial**: shell precacheado; leituras `/api/v1` NetworkFirst 5 s/24 h; escritas só 10 tipos entram na fila (sem PATCH de status, DELETE). Cache do SW ignora `Authorization` na chave (cross-user no mesmo navegador; 401 não limpa caches). Precache inclui `pdf.worker.min` 1,37 MB e chunks 3D.
- Access token em `localStorage` lido/escrito em 5 pontos (`apiClient.ts`, `LoginPage`, `RegisterPage`, `DashboardLayout`, `useJornadaHistorico`, `lib/permissoes`); decodificação de JWT triplicada, `atob` sem UTF-8; `AuthGate` não checa `exp`.
- `hooks/useJornadaHistorico.ts:54-58` (`exportarCsv`): `fetch` bruto com `API_BASE_URL` duplicado, sem refresh em 401 (falha após 15 min) — usar `apiFetchBlob`.
- `API_BASE_URL` com fallback silencioso para `http://localhost:3333`; falhas parecem queda de rede e acionam a fila offline.
- ≈30 hooks reimplementam `state/data/error + load + useEffect`; `LoadState` importado de `useViagens`; **nenhum `AbortController` no `src`** (respostas fora de ordem sobrescrevem estado novo); padrão offline `if (!navigator.onLine) queue…` copiado em 9 hooks (`useViagens:73`, `useFretes:51,84`, `useFronteiraTravessia:39`, `useJornadaEventos:17`, `useManutencoes:81`, `useDepositantes:78`, `useAvarias:49`, `useAtualizarQuilometragem:19`); as 10 funções `queueXxx` são idênticas.
- Páginas gigantes chamando `api.*` direto (ver §3); `App.tsx` (452 L) com ≈50 repetições de `<Route><AuthGate modulo=…>`; sem 404 nem ErrorBoundary global (falha de chunk lazy após deploy + SW `autoUpdate/skipWaiting` → tela em branco).
- Bundle: `index` 401 KB (shared completo + zod + lucide); `xlsx@0.18.5` com CVEs (prototype pollution/ReDoS) processa arquivo do usuário em `lib/lerPlanilha.ts`; duas stacks 3D (three vanilla + r3f).
- `lint` placeholder: sem ESLint (`react-hooks/exhaustive-deps`, `jsx-a11y`).

### BAIXO
Manifest duplicado e sem ícone maskable/`theme_color` por tema; cores 3D hard-coded não respeitam temas escuros; `ROTA_INICIAL` (web) fora de shared e sem `motoristas`; `enums.ts` mistura labels de UI no pacote de domínio; foco/`aria-modal` do `Modal.tsx` e `useReconhecimentoVoz` cleanup **(não confirmado)**.

### Pontos positivos
Todas as páginas lazy; **0 `any`, 0 `dangerouslySetInnerHTML`/`eval`**; cleanup exemplar em `Dashboard3DBarChart` (dispose, forceContextLoss, observers); `lib/gpu.ts` com fallback; `lib/temas.ts` com try/catch no storage; skip-link e ≈130 usos de `aria-/role`; Supabase no cliente só para upload assinado; `.env` ignorado e só anon key no bundle.

---

## 7. Achados — Banco de dados, RLS e migrations

**Inventário RLS:** todas as tabelas têm RLS; **nenhuma policy `using (true)`**. Policies usam `current_user_role()`. Tabelas sem policy de escrita (`ia_solicitacoes` INSERT, `ia_conhecimento`, `campos_personalizados`, `armazens` além do stub admin) só aceitam service-role — intencional, não documentado. Como a API usa service-role, a RLS só protege acesso direto via anon key.

| Grupo | Resumo |
|---|---|
| profiles | SELECT/UPDATE próprio ou S/A (colunas de acesso protegidas por trigger 0013/0016); INSERT S/A **sem restrição de `role` no CHECK**; DELETE só S |
| audit_logs | SELECT S/A; sem trava de imutabilidade |
| veículos/motoristas/viagens/eventos_risco | SELECT S/A/O/V; escrita S/A/O; DELETE S/A |
| apolices_seguro | SELECT S/A/V; escrita S/A |
| fretes / pagamentos / lançamentos | **SELECT todos (inclui V)**; UPDATE de fretes S/A/O |
| registros_jornada | UPDATE S/A e DELETE S (apesar do "insert-only") |
| WMS (depositantes…inventários) | SELECT todos; escrita S/A/O |
| portaria_* / ordens_servico | S/A/O/V/P |
| storage portaria-documentos | SELECT S/A/O/V/P, INSERT S/A/O/P, sem restrição de tamanho/MIME |
| storage motoristas-documentos | sem policies (só service-role) |
| import_datasets, rastreadores, pontos_apoio, clientes, categorias, viagem_cargas, motorista_documentos, campos_personalizados | RLS ativa, padrões por papel |

### ALTO
- **D1** `.mcp.json` e pasta externa — ver S1/S2.
- **D3** `handle_new_user` (0010) + SELECT para todos os papéis: qualquer signup no Supabase Auth vira VISITANTE e lê, via anon key, fretes, pagamentos, lançamentos, apólices, `motorista_documentos` (`ocr_dados` da CNH), clientes, CPFs. `ALLOW_PUBLIC_REGISTRATION` só controla a API. Melhoria: desabilitar signup no painel; `ativo=false` por padrão; tirar V do SELECT financeiro e de PII.
- **D4** `0004:233-238` `fretes_update_admin_operador`: USING deixa OPERADOR atualizar qualquer linha; WITH CHECK valida só o estado novo → **reabrir frete PAGO/APROVADO e alterar `valor_contratado` via PostgREST**. Melhoria: USING restrito a status editáveis para O; trigger de transição e congelamento de valores.
- **D5** `0002:444-450`: INSERT em `profiles` por ADMIN sem restrição de `role` (pode inserir SUPERADMIN); proteção depende do trigger `proteger_campos_acesso_profile`, que trata `auth.uid() is null` como bypass. Melhoria: CHECK no INSERT; revogar INSERT/DELETE de `profiles` de `authenticated`.
- **D6** `0001:202,233,292…`: dezenas de FKs `created_by/registrado_por/validado_por → profiles(id)` sem `ON DELETE` (NO ACTION): usuário que criou algo **não pode ser excluído** (conflito com LGPD). Padronizar `set null`.
- **D7** `status_viagem` com ≈29 valores (8 legados inalcançáveis); sem trigger/CHECK de máquina de estados (idem recebimento/expedição/inventário); qualquer escrita via PostgREST por OPERADOR pula a API. 0014 reescreve dados de forma irreversível sem backup.
- **D8** 0003/0004/0005/0006: `drop table` sem `if exists`/cópia, cast para enum que falha com dado fora do conjunto — 0001–0009 são one-shot; fazer baseline `pg_dump`.
- **D21 Estado das migrations** (atenção): a memória do projeto diz "0013 não aplicada; 0015 pendente". **0016 recria `proteger_campos_acesso_profile` dependendo das colunas `categoria_id`/`permissoes` criadas em 0013** — se 0013 não estiver aplicada, 0016 falha. Ordem obrigatória 0013 → 0015 → 0016. Não há `schema_migrations`; o estado do banco vivo não é verificável pelo repo. **Ação:** confirmar com query read-only em `information_schema` e atualizar a nota de memória. `seed.sql` está desatualizado (status legado `EM_TRANSITO`, sem `on conflict`).

### MÉDIO
- Policies chamam `current_user_role()` por linha em vez de `(select current_user_role())`.
- `uuid_generate_v7`/`set_updated_at` sem `search_path` (baixo); `handle_new_user`: e-mail `not null unique` — signup sem e-mail ou duplicado aborta a criação no Auth; não sincroniza troca de e-mail.
- `UNIQUE` simples (não parcial) em `veiculos.placa`, `motoristas.cpf`, `viagens.numero_crt`, `profiles.email`: registro soft-deleted bloqueia recadastro; índices redundantes com os UNIQUE; `viagens.placa_cavalo` FK `on update cascade` para `veiculos(placa)`.
- Nenhuma policy filtra `deleted_at is null`; DELETE físico permitido a A/S, contradizendo a convenção; várias tabelas sem `deleted_at`; `armazens.updated_at` sem trigger.
- `audit_logs` só é escrito pela API (alteração direta via PostgREST não é auditada) e é mutável.
- Storage: sem `file_size_limit`/`allowed_mime_types`; V lê documentos da portaria.
- `registros_jornada` declarado "INSERT-ONLY" mas com policies UPDATE/DELETE — trigger de bloqueio ausente.
- CHECKs ausentes: valores monetários/peso ≥ 0, ordem de datas, faixa de lat/long, `tempo_*_minutos ≥ 0`, bateria 0–100, formato de CPF/CNPJ, `pais_destino`.
- Convenção mista enum vs `text`+CHECK; `portaria_saidas.situacao_descarga` livre.
- **Índices em FK ausentes** (`eventos_risco.created_by`, `recebimento_itens/expedicao_itens/inventario_itens.endereco_id`, `movimentacoes_estoque.endereco_origem_id/destino_id`, `avarias.*`, `viagem_motorista_historico.*`, `status_*_historico.changed_by`, `ia_solicitacoes.decidido_por`, etc.) e de filtro (`viagens (status, data_programacao)`, `viagens.cliente`, `motoristas.nome_completo`). 0016 cobriu só duas.
- Idempotência: 0001–0009 sem `if not exists`; `ALTER TYPE ADD VALUE` dentro de transação (erro 55P04) sob `supabase db push`; `supabase/config.toml` inexistente.
- **Dinheiro em `numeric` (correto) mas sem coluna `moeda`** apesar do transporte internacional (BRL/USD/ARS…); só `viagem_cargas` tem.

### BAIXO
Normalização cega para `ABERTO` em 0004; sem constraint que impeça soma de pagamentos > `valor_contratado`; tabelas sem policy de escrita sem comentário; `seed.sql` não idempotente.

---

## 8. Testes, CI/CD e dependências

| Tema | Situação |
|---|---|
| Vitest (API) | 9 arquivos; só funções puras (importação, jornadaCompliance, estoqueLedger, erpExport.mapper, csv) + `usuarios.integration` |
| Sem testes | viagens, frete/financeiro (máquina de estados e permissões por papel), portaria, WMS (além do ledger puro), auth/RBAC, `adminDados`, chatbot, rotas de importação, `iaSolicitacoes.aprovar`, `inteligente.gravar`, schemas de `shared`, **todo o web** (sem runner) |
| Banco real | **Nenhum teste toca Postgres**: tudo em `fakeSupabase`; RLS, triggers, CHECKs, enums e migrations nunca são exercitados |
| E2E | 11 specs Playwright, `workers:1`, `retries:0`, sem `waitForTimeout/skip/only`; `reuseExistingServer: true` pode reaproveitar servidor com `.env` real na porta 3333; dependência de ordem entre specs; credencial fixa `Teste@123` (ok por ser do fake) |
| Concorrência | Nenhum teste de duas requisições paralelas (justamente onde estão N1–N14) |
| CI/CD | **Ausente** (`.github/` inexistente); deploy direto no Coolify; `lint` placeholder em todos os pacotes; `format:check` não executado |
| Dockerfiles | `|| pnpm install` mascara lockfile; sem lockfile no runtime da API; Node 22 vs 20; `VITE_*` com placeholders |
| Dependências | `xlsx@0.18.5` (CVEs, abandonado); `groq-sdk ^0.7.0`; `uuid` morto; `pino-pretty` em `dependencies`; versões antigas (react-router 6, vite 5, tailwind 3, lucide 0.446, zod 3 — não bloqueantes); `zod`/`typescript` repetidos sem `catalog`/`overrides`; `tsconfig` sem `noUncheckedIndexedAccess` |

---

## 9. Higiene do repositório

- Rastreados na raiz: `RIGABRAS_Controle_GR.xlsx` (dados operacionais reais), `Resumo Rigabras.pdf`, `Rigabras_Diagnostico.pptx`, 3 imagens, 3 `.md` de prompt/base de conhecimento — mover para `docs/` e tirar planilhas reais do histórico (`git filter-repo`) se o repo for compartilhado.
- Gitlink `.claude/worktrees/agent-a47f7e49f5b7261f6` sem `.gitmodules` (quebra clone, arrasta cópia do projeto).
- Pasta não rastreada `gestão-de-frotas-&-viagens/` (nome com `&` e acento; `node_modules`, `.env`, `firebase-applet-config.json`, cópias de planilhas).
- `backup-reset-importacao-2026-09-30T…json`: ignorado pelo git, mas dump real (viagens, motoristas com CPF/CNH) sem criptografia dentro do OneDrive.
- `.gitignore` não cobre `*.xlsx`, `*.pptx`, `.env.production`, `.claude/worktrees/`, `.claude/settings.local.json`.
- Nenhum segredo versionado foi encontrado por `git grep` (padrões `sbp_`, `gsk_`, `eyJ…`); o único segredo real está no `.mcp.json` não rastreado.
- README (linha ≈275) descreve "refresh rotativo" e "RLS por transição" que o código não implementa.

---

## 10. Lista de funções críticas

| Arquivo | Função | Problema | Complexidade | Risco | Melhoria |
|---|---|---|---|---|---|
| `wms/estoque.repository.ts` | `registrarMovimentacao` / `aplicarDeltaSaldo` | RMW sem transação; `Math.max(0,…)` | 4–6 round-trips | Crítico | RPC com `FOR UPDATE` |
| `wms/expedicoes.service.ts` | `separarItem`, `expedir`, `cancelar`, `transicionar` | Baixa antes de update; loops sem idempotência | Média | Crítico | RPC + claim atômico |
| `wms/recebimentos.service.ts` | `conferirItem` | `updateItem` antes do ledger | Média | Alto | Inverter ordem/RPC |
| `wms/inventarios.service.ts` | `reconciliar` | Compara com snapshot; loop não atômico | Alta | Alto | Delta vs saldo atual, RPC |
| `fretes/fretes.service.ts` | `changeStatus`, `createPagamento` | Sem lock; pagamento > saldo | Média | Alto | Update condicional; validar saldo |
| `viagens/viagens.service.ts` | `create`, `update`, `changeStatus`, `sincronizarRecebimentoAutomatico` | Multi-passo; erro após persistir | Média | Alto | RPCs transacionais |
| `viagens/viagens.repository.ts` | `replaceCargas` | DELETE + INSERT | Baixa | Alto | RPC transacional |
| `jornada/jornada.service.ts` | `registrarEvento` | Race; timestamp do cliente | Média | Alto | Advisory lock, validar janela |
| `importacao/inteligente/consolidacao.ts` | `consolidar` | ≈845 linhas numa função | Muito alta | Médio | Estágios por entidade |
| `importacao/inteligente/inteligente.service.ts` | `gravar`, `carregarBase` | ≈175 linhas, N+1 de escrita, sem transação, `select('*')` | Alta | Alto | Job + upsert em lote |
| `importacao/importacao.service.ts` | `coagirEValidarLinhas`, `importar` | Stub antes da validação; insert por linha | Média | Médio/Alto | Validar antes de gravar |
| `iaSolicitacoes/iaSolicitacoes.service.ts` | `aprovar` | Sem claim; catch → ERRO após gravar | Média | Alto | Claim `PROCESSANDO` |
| `iaSolicitacoes/analisador.ts` | `processarEntidade` | ≈206 linhas | Alta | Médio | Dividir |
| `motoristas/motoristas.documentos.ts` | `enviarDocumentos` | Tamanho após decode; MIME livre; órfãos | Média | Alto | Whitelist+magic bytes, rollback |
| `erpExport/internalCsvJsonAdapter.ts` | `exportFinanceiro`, `exportEstoque` | N+1; truncamento 1000; UTC | Média | Alto | `fetchAllPages`, view SQL |
| `portaria/portaria.service.ts` | `getKpis`, `gerarUrlUploadDocumento` | 4 listas completas; upload sem limite | Média | Alto | `count`, limites no bucket |
| `usuarios/usuarios.service.ts` | `update`, `remove` | Senha antes de validar; último SUPERADMIN | Média | Médio | Reordenar, guarda |
| `auth/auth.service.ts` | `issueSession`, `refresh` | `jti` não persistido | Baixa | Alto | Tabela de refresh |
| `adminDados/adminDados.service.ts` | `atualizar`, `excluir`, validação de colunas | Falha aberta; select+update | Média | Médio/Alto | Falhar fechado |
| `app.ts` | `buildApp` | ≈125 linhas; trustProxy | Média | Crítico (config) | Plugins; default seguro |
| `web/offline/syncManager.ts` | `trySync`, `sendMutation` | Sem idempotência/backoff; erro permanente = transitório | Média | Alto | Header de idempotência, classificar erro |
| `web/hooks/useJornadaHistorico.ts` | `exportarCsv` | `fetch` bruto sem refresh | Baixa | Médio | `apiFetchBlob` |

---

## 11. Roteiro sugerido (não implementado)

**Imediato (dias):** rotacionar tokens; `trustProxy`; validar segredos/placeholder em produção; desativar signup público e fechar SELECT de V; corrigir policy `fretes_update`; confirmar estado 0013/0015/0016; limpar repo (gitlink, backup com PII, pasta externa, planilha).

**Curto (1–3 semanas):** RPCs transacionais para estoque/expedição/recebimento/inventário/frete/viagem; refresh rotativo; `fetchAllPages`/agregação no ERP e KPIs; Zod em query/params; `DomainError` no handler global; whitelist/magic bytes nos uploads; Idempotency-Key + UI de pendências na fila offline; CSP no nginx; CI mínima (typecheck, build, vitest).

**Médio (1–2 meses):** testes de integração contra Postgres real (Supabase local/pgTAP) para RLS e máquinas de estado, testes de concorrência; jobs assíncronos de importação; refatorar `consolidar`/`analisador`; hook genérico `useApiQuery` com abort; consolidar mapeadores de erro; tipos gerados do banco; baseline de migrations e `schema_migrations`; ESLint com `no-floating-promises`/`react-hooks`/`jsx-a11y`; trocar `xlsx`.

---

## 12. Limitações desta análise

- Leitura estática; nada foi executado (build, testes, banco vivo).
- Algumas inferências estão marcadas; dependências circulares, `ia.ts` (timeouts), `unique` de `recebimentos.viagem_id`, focus-trap de `Modal`, `useReconhecimentoVoz` e `Dockerfile` do web não foram verificados a fundo.
- A contagem de specs e2e diverge entre subagentes (11 por `git ls-files`; 16 citado) — vale a lista de arquivos como referência.
- Valores de segredos foram deliberadamente omitidos deste documento.
