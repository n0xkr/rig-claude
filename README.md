# Rigabras — Ecossistema Integrado de Gestão Logística (TMS + WMS)

Scaffold fullstack de produção para a **Rigabras Transportes** (Uruguaiana/RS —
transportadora rodoviária internacional TRIC + Armazém Geral, fronteira
Uruguaiana ↔ Paso de los Libres). Este projeto substitui os controles manuais
e fragmentados descritos na base de conhecimento da empresa (datas de
programação/coleta em planilhas, controle de CRT/MIC-DTA em papel, ausência de
trilha estruturada de eventos de risco) por um fluxo digital ponta a ponta:
**Programação → Coleta → Documentação → Veículo/Motorista → Validação →
Viagem → Monitoramento → Eventos → Entrega → Encerramento.**

Esta sessão entrega, como implementação de referência completa, o
**Módulo 1 — Gerenciamento de Risco**, o **Módulo 2 — TMS Operacional**
(ciclo de vida estendido da viagem, sub-fluxo de travessia de fronteira com
KPIs e validação cruzada pré-embarque — ver detalhes na seção "Módulo 2"
abaixo), o **Módulo 3 — Controle Financeiro do Frete** (frete contratado,
fechamento da viagem com máquina de estados e RBAC granular por transição,
saldo do frete e frete de retorno vazio — ver seção "Módulo 3" abaixo) e o
**Módulo 4 — Controle de Frota e Jornada** (indicadores de frota — km
rodado/vazio, custo/km, consumo, ocupação, manutenções — e controle de
jornada com motor de conformidade da ADI 5322 — ver seção "Módulo 4"
abaixo) e o **Módulo 5 — WMS (Armazém Geral)** (depositantes, catálogo de
produtos, mapa de ocupação do armazém, recebimento/conferência,
separação/reembalagem/etiquetagem, cross-docking/expedição, controle de
avarias, inventário/reconciliação e KPIs de ocupação/giro de estoque, todos
sobre um ledger imutável de movimentações de estoque — ver seção "Módulo 5"
abaixo). Uma sessão subsequente também corrigiu um bug de status HTTP
encontrado nos controllers dos Módulos 1/2 — ver "Bug corrigido" abaixo.

Uma sessão final entrega o **Módulo 6 — Integração TMS + WMS** (a expedição
do armazém avisa a viagem do TMS quando a mercadoria está pronta para coleta,
e a entrega da viagem pode gerar automaticamente o cabeçalho de um
recebimento no armazém — ver seção "Módulo 6" abaixo, com o detalhamento
honesto de qual das duas pontas está 100% automatizada e qual é parcial) e o
**Módulo 7 — Integração ERP** (exportação documentada de dados financeiros do
frete e de movimentações de estoque, em CSV/JSON, atrás de um único contrato
`ErpAdapter` — ver seção "Módulo 7" abaixo). Com isso, **todos os 7 módulos da
ordem estratégica do prompt original estão implementados** (com as ressalvas
parciais explicitadas em cada seção, nunca escondidas).

— ver [`docs/NOTES.md`](./docs/NOTES.md) para o detalhamento completo de
decisões de modelagem dos Módulos 6/7.

### Bug corrigido (Módulos 1 e 2) — status HTTP incorreto em erros de domínio

Os controllers de `apolices`, `eventosRisco`, `motoristas`, `veiculos`,
`viagens`, `fronteira`, `documentosEmbarque` e `validacaoPreEmbarque` usavam
um helper `handleDomainError` que chamava
`Problems.badRequest(reply, ...).status(error.status)` — como `.send()` já
havia sido executado dentro de `Problems.badRequest`, a chamada `.status()`
seguinte não tinha efeito algum no Fastify, então **todo erro de domínio
(404/409/422/403) era respondido como HTTP 400**, tanto no status code real
quanto no campo `status` do corpo RFC 7807. O Módulo 3 (`fretes`) já usava o
padrão correto (`sendProblem(reply, error.status, ...)`); esse mesmo padrão
foi replicado nos 8 controllers acima. Verificado com um teste de
`fastify.inject()` comparando o padrão antigo e o novo lado a lado: antes,
`NotFoundError`/`ConflictError` retornavam `400`; depois, `404`/`409`
respectivamente (ver detalhes em `docs/NOTES.md`).

## Arquitetura

```
rig-claude/
├── apps/
│   ├── api/     Fastify + TypeScript (routes → controllers → services → repositories)
│   └── web/     React 19 + Vite + Tailwind, PWA offline-first
├── packages/
│   └── shared/  Zod schemas + tipos TS compartilhados entre web e api
├── supabase/
│   ├── migrations/   0001_initial.sql, 0002_rls_policies.sql,
│   │                 0003_modulo2_tms_operacional.sql,
│   │                 0004_modulo3_financeiro_frete.sql,
│   │                 0005_modulo4_frota_jornada.sql,
│   │                 0006_modulo5_wms_armazem_geral.sql,
│   │                 0007_modulo6_modulo7_integracao_tms_wms_erp.sql
│   └── seed.sql
└── docs/NOTES.md     decisões de modelagem por módulo (1–7)
```

Banco de dados e autenticação: **Supabase** (Postgres gerenciado + Auth). A
API usa o cliente `@supabase/supabase-js` com a **service-role key**
(bypassa RLS) e reforça RBAC na camada HTTP; o acesso direto ao banco (ex: uma
consulta ad-hoc no Supabase Studio com um usuário autenticado) continua
protegido pelas políticas de **Row Level Security** definidas em
`0002_rls_policies.sql`, então o controle de acesso é aplicado em **duas
camadas independentes** (defesa em profundidade).

IA: **Groq** (SDK compatível com OpenAI) para análise de risco/anomalia de
viagens (`POST /api/v1/viagens/:id/analise-risco`), com graceful-degrade
(HTTP 503 com Problem Details) quando `GROQ_API_KEY` não está configurada —
o servidor nunca derruba por falta dessa chave.

## Setup

Pré-requisitos: Node.js ≥ 20, pnpm ≥ 9, uma conta/projeto Supabase e uma
chave de API da Groq (opcional para rodar, obrigatória para o endpoint de IA).

```bash
# 1. Instalar dependências do monorepo
pnpm install

# 2. Configurar variáveis de ambiente
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# edite os arquivos .env com as credenciais reais do seu projeto Supabase e Groq

# 3. Aplicar as migrations no seu projeto Supabase (via Supabase Studio ou psql)
#    supabase/migrations/0001_initial.sql
#    supabase/migrations/0002_rls_policies.sql
#    supabase/migrations/0003_modulo2_tms_operacional.sql
#    supabase/migrations/0004_modulo3_financeiro_frete.sql
#    supabase/migrations/0005_modulo4_frota_jornada.sql
#    supabase/seed.sql   (opcional, apenas dev)

# 4. Rodar em desenvolvimento (api + web em paralelo)
pnpm dev
# api:  http://localhost:3333  (healthz: /healthz, readyz: /readyz)
# web:  http://localhost:5173
```

**Bug corrigido nesta sessão**: `apps/api/src/config/env.ts` nunca teve nenhum
mecanismo de leitura de `.env` (nem `dotenv`, nem `node --env-file` nos
scripts), então `pnpm dev`/`pnpm --filter @rigabras/api dev` sempre falhavam
com "Required" para toda variável, mesmo com um `.env` presente — o operador
precisava exportar cada variável manualmente no shell. Um carregador de
`.env` minimalista e sem dependência externa foi adicionado (nunca sobrescreve
uma variável já definida no ambiente real/CI).

## Testes

Esta seção documenta a suíte de testes entregue nesta sessão final —
Prettier + typecheck + `vitest` (critérios já existentes) e, como novidade,
uma suíte **Playwright** de ponta a ponta.

### Backend usado pelos testes: banco falso em memória, não Supabase real

Este sandbox de testes **não tem Docker disponível** (`docker`/`supabase
start` não funcionam aqui), então não havia como rodar um Supabase local
real. A alternativa adotada foi um **cliente Supabase falso em memória**
(`apps/api/src/config/fakeSupabase.ts`), ativado com `USE_FAKE_DB=true` no
`.env` da API: ele implementa a mesma API encadeável do
`@supabase/supabase-js` (`.from().select().eq()...`) usada por **todos** os
repositories, então nenhum arquivo de rota/controller/service/repository
precisou mudar — só o I/O (Postgres real) foi trocado por um `Map` em
memória, com um seed mínimo (`fakeSupabaseSeed.ts`: um perfil por papel de
RBAC + um armazém). **Isso significa que as migrations SQL (0001-0007) e as
políticas de RLS continuam sem verificação contra um Postgres real** — a
mesma ressalva pré-existente do projeto, documentada em cada seção de módulo
acima, não foi resolvida por este mecanismo (e não tem como ser, sem
Docker). `USE_FAKE_DB` nunca deve ser `true` em produção (documentado no
próprio `env.ts`).

Dois gaps reais e pré-existentes do frontend foram corrigidos para que o
login e a máquina de estados da viagem pudessem ser testados pela UI de
verdade (não são artefatos do banco falso — afetam qualquer backend):

- **Não existia nenhuma tela de login.** `apiClient.ts` já lia
  `localStorage.getItem('rigabras_access_token')` em toda chamada, mas nada
  no app jamais escrevia essa chave — não havia como um usuário real se
  autenticar pela UI, apesar de `POST /api/v1/auth/login` sempre ter
  funcionado. Adicionada `apps/web/src/pages/LoginPage.tsx` +
  `apps/web/src/components/AuthGate.tsx` (guarda de rota client-side,
  redireciona para `/login` sem token) + botão de logout no header.
- **Não existia nenhum controle para mudar o status de uma viagem.**
  `PATCH /viagens/:id/status` (a máquina de estados completa do Módulo 2)
  nunca era chamado por nenhuma tela — `ViagemDetailPage` só lia o
  histórico. Adicionado um controle mínimo "Avançar status da viagem"
  (`apps/web/src/hooks/useChangeViagemStatus.ts` + seção nova em
  `ViagemDetailPage.tsx`).

### Bugs reais encontrados e corrigidos ao exercitar a aplicação de ponta a ponta pela primeira vez

1. **`POST /viagens/:viagemId/fronteira/eventos` sempre retornava 422** —
   o controller validava o body com `CreateEventoFronteiraSchema` (que
   exige `viagem_id`) **antes** de mesclar o `viagem_id` vindo da URL; como
   o frontend corretamente nunca envia esse campo no corpo (vem da rota),
   toda chamada falhava. Corrigido com um novo
   `CreateEventoFronteiraNestedSchema` (omite `viagem_id`), mesmo padrão já
   usado por `CreateFreteNestedSchema` no Módulo 3.
   (`packages/shared/src/entities/eventoFronteira.ts`,
   `apps/api/src/modules/fronteira/fronteira.controller.ts`)
2. **`POST /viagens/:viagemId/documentos` tinha o mesmo bug** — mesma causa
   raiz, mesma correção (`CreateDocumentoEmbarqueNestedSchema`).
   (`packages/shared/src/entities/documentoEmbarque.ts`,
   `apps/api/src/modules/documentosEmbarque/documentosEmbarque.controller.ts`)
3. **Todo botão de transição sem payload do Módulo 5 estava quebrado** —
   "Iniciar conferência"/"Concluir" (recebimento), "Iniciar
   separação"/"Pronta para expedição"/"Expedir"/"Cancelar" (expedição),
   "Iniciar contagem"/"Reconciliar"/"Encerrar" (inventário): o helper
   `api.post(path)` do frontend sempre enviava `Content-Type:
application/json` mesmo sem corpo, e o Fastify rejeita isso com `400
FST_ERR_CTP_EMPTY_JSON_BODY` ("Body cannot be empty..."). Corrigido em
   `apps/web/src/lib/apiClient.ts`: o header só é enviado quando há de fato
   um `body`. Este era provavelmente o bug de maior impacto encontrado —
   quebrava a maior parte do fluxo operacional do Módulo 5 na UI real,
   nunca detectado porque essas rotas nunca haviam sido clicadas de
   verdade antes desta sessão.

### Rodando a suíte

```bash
# instala os browsers do Playwright (uma vez só; ~300 MB, precisa de rede)
npx playwright install chromium

# .env necessários (ver acima) — apps/api/.env com USE_FAKE_DB=true e
# WEB_ORIGIN=http://127.0.0.1:5173 (tem que bater exatamente com a origem
# usada pelo Chromium do Playwright, senão a API bloqueia por CORS)

pnpm test:e2e            # roda toda a suíte (sobe api+web sozinho via webServer)
pnpm test:e2e:report     # abre o relatório HTML da última execução
```

A `playwright.config.ts` (raiz do repo) já sobe `apps/api` (com
`USE_FAKE_DB=true`) e `apps/web` automaticamente (`webServer`), reaproveita
um servidor já rodando se houver um de pé, e roda com 1 worker (as specs
compartilham o mesmo banco falso em memória dentro de uma execução).

### Cobertura: 19/19 specs Playwright passando, cobrindo os 7 módulos

`tests/e2e/*.spec.ts` — todas rodam num Chromium real, contra a API e o web
reais (não mocks de rede):

- `01-auth-rbac.spec.ts` (8 testes): login como ADMIN e OPERADOR, senha
  errada, rota protegida sem sessão, logout, RBAC ocultando/mostrando a
  tela de Exportações por papel, e a mesma checagem 403/200 direto na API.
- `02-modulo1-viagens.spec.ts` (2): cria viagem → aparece na lista → abre o
  detalhe; estado vazio de um filtro sem resultados.
- `03-modulo2-ciclo-vida-fronteira.spec.ts` (2): transição de status pela
  UI + linha do tempo atualizando; registro de etapa de fronteira + KPIs
  agregados por rota/viagem.
- `04-modulo3-financeiro.spec.ts` (1): avança a viagem até ENTREGUE, registra
  o frete, roda o fechamento completo (OPERADOR envia para conferência,
  troca de sessão para ADMIN aprova e paga), confere o saldo chegando a
  zero.
- `05-modulo4-jornada.spec.ts` (1): registra eventos de jornada, abre o
  painel de alertas de conformidade.
- `06-modulo5-wms.spec.ts` (1): cria depositante + produto, registra
  recebimento, roda a conferência até `ENDERECADO`.
- `07-modulo6-integracao-tms-wms.spec.ts` (1): a seção "Integração com o
  armazém (WMS)" da viagem mostra a expedição vinculada a ela.
- `08-modulo7-erp-export.spec.ts` (2): visualização JSON + download real de
  CSV, para os dois tipos de exportação (financeiro/estoque).
- `09-offline-queue.spec.ts` (1): cria uma viagem com `context.setOffline(true)`
  (emulação real do Playwright), confirma o enfileiramento local, volta a
  ficar online e confirma que `apps/web/src/offline/syncManager.ts`
  sincronizou de verdade com a API.

Pré-requisitos honestos, sem tela própria no app (criados via API dentro do
teste, nunca simulados): motoristas, endereços de armazém e o vínculo
expedição↔viagem do Módulo 6 (`viagem_id` na criação da expedição) — nenhuma
tela permite fazer isso hoje, só a API. Documentado em comentário no topo de
cada spec que depende disso.

### O que continua sem cobertura (gaps honestos)

- **RLS do Supabase e as migrations 0001-0007 continuam nunca verificadas
  contra um Postgres real** — o banco falso em memória valida
  routing/RBAC/regras de negócio/máquinas de estado reais, mas não
  constraints de schema SQL, triggers, nem policy de RLS. Só um Supabase
  real (local via Docker, ou um projeto de staging) resolve isso.
- Telas sem cobertura Playwright: `ValidacaoPage` (validação cruzada
  pré-embarque), `FrotaKpiPage`/manutenções, `ArmazemMapaPage`,
  `AvariasListPage`, o fluxo completo de separação/expedição (só o vínculo
  com a viagem foi testado, não o workflow de separação item a item).
- Nenhum teste de carga/performance, nenhum teste de acessibilidade
  automatizado.

## Mapeamento dos 17 Critérios de Excelência de Produção

| #   | Critério            | Status nesta sessão                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Funcionalidade      | **Satisfeito (Módulos 1–7)** — CRUD completo de viagens/veículos/motoristas/eventos_risco/apólices/fretes/manutenções/depositantes/produtos/endereços, máquinas de estado explícitas: viagem (`TRANSICOES_STATUS_VIAGEM`, 12 status Programação→...→Encerramento), fechamento do frete (`TRANSICOES_STATUS_FECHAMENTO_FRETE`: ABERTO→EM_CONFERENCIA→APROVADO→PAGO, com REJEITADO como retrabalho), log de jornada (`PROXIMO_EVENTO_JORNADA_VALIDO`, Módulo 4), recebimento (`TRANSICOES_STATUS_RECEBIMENTO`), expedição (`TRANSICOES_STATUS_EXPEDICAO`) e inventário (`TRANSICOES_STATUS_INVENTARIO`, Módulo 5), todas com trilha de histórico dedicada (`status_viagem_historico` — agora também com `origem_evento` para notas WMS do Módulo 6 —, `status_frete_historico`, o próprio `registros_jornada` imutável, o ledger `movimentacoes_estoque` imutável) além do `audit_logs` geral. Módulo 6 (Integração TMS+WMS): expedição→viagem (aviso de "pronta para coleta") **totalmente implementado e testável ponta a ponta**; entrega→recebimento **implementado, mas parcial por natureza dos dados** — cria automaticamente o cabeçalho do recebimento (depositante/referência/data), nunca bloqueia a confirmação da entrega, mas os itens (SKU/quantidade) continuam manuais porque o TMS não detalha a composição da carga (ver seção "Módulo 6"). Módulo 7 (Integração ERP): exportação funcional via `ErpAdapter`/`InternalCsvJsonAdapter`. UseCases isolados em `*.service.ts`. Idempotência/debounce de cliques: **parcial** — schema suporta, dedupe de submissão dupla no formulário web não implementado nesta sessão. |
| 2   | Interface e UX      | **Satisfeito (parcial)** — loading/empty/error states implementados nas telas de viagens e de fretes/fechamento financeiro; responsividade básica via Tailwind. Busca com debounce, filtros multi-critério avançados e modais de confirmação: **deferidos**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 3   | Dados               | **Satisfeito** — soft delete (`registros_jornada` e `movimentacoes_estoque` são as tabelas imutáveis por design — ver seções Módulo 4 e Módulo 5), timestamps UTC, função `uuid_generate_v7()` (aproximação PL/pgSQL, upgrade documentado para `pg_uuidv7`), índices em FKs, migrations numeradas (0001–0007), `audit_logs` implementada e escrita em toda mutação dos Módulos 1–7. Módulo 6 adiciona só o mínimo de colunas (`status_viagem_historico.origem_evento`, `viagens.destino_armazem_rigabras`/`depositante_id`, `recebimentos.viagem_id`) sem alterar nenhuma tabela/coluna existente. Módulo 7 não introduz nenhuma tabela nova (exportação é 100% derivada).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 4   | Segurança           | **Satisfeito (parcial)** — JWT de 15 min + refresh rotativo em cookie httpOnly, RBAC 4 papéis reforçado em duas camadas (middleware da API + RLS do Supabase, inclusive **por transição de estado** no fechamento do frete — só ADMIN/SUPERADMIN aprovam/pagam —, **insert-only** no log de jornada do Módulo 4 e no ledger `movimentacoes_estoque` do Módulo 5, e a **reconciliação de inventário** restrita a ADMIN/SUPERADMIN, e agora também a **exportação ERP do Módulo 7** restrita a ADMIN/SUPERADMIN mesmo sendo rotas GET), Zod em todas as rotas, rate limit (100/min geral, 5/min em `/login`), Helmet. Hash de senha é delegado ao Supabase Auth (não usamos Argon2/Bcrypt próprios).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 5   | Backend/API         | **Satisfeito** — rotas `/api/v1/...`, RFC 7807 em todos os erros dos Módulos 2/3/4 (o bug de status code do helper `handleDomainError` dos Módulos 1/2, descrito em `docs/NOTES.md`, foi **corrigido nesta sessão** em todos os 8 controllers afetados), `/healthz` e `/readyz`. Header `Idempotency-Key`: **deferido** (não implementado nesta sessão).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 6   | Performance         | **Deferido** — sem Redis/cache nesta fase (não provisionado), paginação por cursor implementada nas listagens, mas sem Brotli/Gzip configurado na API (o Nginx do frontend faz gzip). Code-splitting: básico via Vite.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 7   | Confiabilidade      | **Satisfeito (parcial)** — graceful shutdown (SIGINT/SIGTERM). Circuit breaker para chamadas externas (Groq) e transações multi-tabela explícitas: **deferidos**. Backup automatizado do banco: fora do escopo (gerido pelo Supabase).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 8   | Integrações         | **Não aplicável nesta fase** — decisão de produto registrada no prompt original: sem webhooks externos por enquanto, apenas RLS do Supabase. Groq é chamado de forma síncrona, sem fila BullMQ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 9   | Observabilidade     | **Satisfeito** — logs JSON estruturados (pino), Correlation-ID por requisição propagado em log e header de resposta. Tracing distribuído: **deferido**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 10  | Testes              | **Satisfeito (parcial)** — motor de conformidade ADI 5322 do Módulo 4 (`jornadaCompliance.ts`) tem 6 testes unitários (`vitest`) cobrindo as regras centrais (espera conta como jornada, descanso fracionado, descanso contínuo válido, descanso insuficiente entre jornadas, excesso de direção/jornada, sessão em aberto). O ledger de estoque do Módulo 5 (`estoqueLedger.ts`) tem 13 testes unitários cobrindo o delta de saldo por tipo de movimentação, ocupação, giro de estoque e ajustes de inventário. O bug de status HTTP dos Módulos 1/2 foi verificado com `fastify.inject()` comparando padrão antigo x novo. O Módulo 7 (`erpExport.mapper.test.ts`) tem 7 testes unitários cobrindo o mapeamento frete+saldo -> registro ERP financeiro, movimentação+produto -> registro ERP de estoque (inclusive quando o join do produto não retorna nada) e o filtro de período (extremos inclusive). Total: 26 testes `vitest` passando. **Sessão final**: suíte Playwright de ponta a ponta somada (19/19 passando, browser real) — ver seção "Testes" acima para a suíte completa, o backend falso em memória usado (sem Docker disponível neste sandbox) e os bugs reais encontrados e corrigidos. Cobertura de 100% dos UseCases/rotas HTTP: **deferida** para os demais módulos.                                                                                                                                                                                                                                                                                                                                            |
| 11  | DevOps              | **Satisfeito (parcial)** — Dockerfiles multi-stage Alpine para api e web, validação de env no boot com `process.exit(1)`. Pipeline de CI (lint→typecheck→test→build): **deferido** (nenhum arquivo de workflow criado).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 12  | Documentação        | **Satisfeito (parcial)** — este README, `docs/NOTES.md` por módulo (agora incluindo os Módulos 6 e 7, com o detalhamento honesto do que é totalmente automatizado vs. parcial). OpenAPI/Swagger vivo e dicionário de dados formal: **deferidos**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 13  | Escalabilidade      | **Satisfeito (parcial)** — API stateless (sessão via JWT, não em memória do processo), pronta para múltiplas réplicas atrás de LB. Filas de workers dedicados: **deferido** (não há BullMQ/Redis configurado).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 14  | Administração       | **Deferido** — painel de administração com métricas de negócio, gestão de usuários e consulta de auditoria via UI não foram construídos (a tabela `audit_logs` existe e é gravada, mas sem tela de consulta).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 15  | Qualidade de Código | **Satisfeito** — TypeScript `strict: true` em todos os workspaces, arquitetura em camadas, zero credenciais hardcoded (tudo via `.env`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 16  | Produção            | **Deferido** — TLS/domínio, subnet privada de banco e rollback automático pós-deploy dependem da infraestrutura de hospedagem (Coolify) e não foram configurados neste scaffold.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 17  | Definition of Done  | **Parcial** — Módulo 1 está Implementado → Integrado → Validado (Zod) → Seguro (RBAC/RLS) → Persistindo → Tratando erros (RFC 7807) → Monitorado (logs). **Testado**: parcial — 26 testes `vitest` (lógica pura) + 19 specs Playwright de ponta a ponta (browser real, contra um banco falso em memória, não um Postgres real — ver seção "Testes"). **Pronto para produção** (TLS, CI, backups, Supabase/RLS real) ainda não.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Módulo 2 — TMS Operacional

Estende o Módulo 1 (não cria uma tabela paralela): a entidade `viagens` ganha
um ciclo de vida mais granular, com dois sub-módulos novos (fronteira e
validação pré-embarque).

- **Máquina de estados estendida** — `StatusViagem` (em `packages/shared`)
  agora tem 12 estados: `PROGRAMADA → AGUARDANDO_COLETA → EM_COLETA →
EM_DOCUMENTACAO → VEICULO_MOTORISTA_DEFINIDO → EM_VALIDACAO_PRE_EMBARQUE →
EM_TRANSITO → NA_FRONTEIRA → EM_MONITORAMENTO → ENTREGUE → ENCERRADA`, com
  `CANCELADA` como saída da maioria dos estados. Toda transição válida grava
  uma linha em `status_viagem_historico` (além do `audit_logs` geral);
  transições inválidas retornam `422 Problem Details`.
  - `PATCH /api/v1/viagens/:id/status` — dispara a transição (aceita
    `observacoes` opcional).
  - `GET /api/v1/viagens/:id/status-history` — lista o histórico completo.
- **Travessia de fronteira** (`apps/api/src/modules/fronteira`) — etapas
  `AGENDAMENTO → CHEGADA → GATE → FISCALIZACAO → DESEMBARACO → SAIDA →
LIBERACAO`, cada uma timestampada, com tempo parado, motivo de retenção,
  retrabalho documental e custo estimado de espera.
  - `GET/POST /api/v1/viagens/:viagemId/fronteira/eventos`
  - `GET /api/v1/fronteira/kpis?rota=&periodStart=&periodEnd=` — agrega tempo
    parado, tempo de desembaraço, retenção, retrabalho documental, custo
    estimado da espera e performance por viagem/por rota.
- **Validação cruzada pré-embarque**
  (`apps/api/src/modules/validacaoPreEmbarque`) — cruza CRT/MIC-DTA/placa
  cadastrados na viagem, os documentos de embarque cadastrados
  (`documentos_embarque`) e o payload informado (fatura, MIC/DTA, placa
  declarada), retornando uma lista estruturada de achados
  (`campo`, `severidade` `INFO|AVISO|BLOQUEANTE`, `mensagem`,
  `valorEsperado`/`valorEncontrado`) — nunca apenas um booleano.
  - `POST /api/v1/viagens/:viagemId/validacao-pre-embarque`
- **Telas web** — `ViagemDetailPage` ganhou a linha do tempo do ciclo de vida
  (histórico de status) e links para as duas telas novas:
  `FronteiraTravessiaPage` (registro de etapas + KPIs da viagem) e
  `ValidacaoPage` (formulário + lista de achados); `FronteiraKpiPage` traz o
  painel agregado por rota/viagem, acessível pelo header. Novos hooks:
  `useViagemStatusHistory`, `useFronteiraTravessia`, `useFronteiraKpis`,
  `useValidacaoPreEmbarque` — reaproveitando a mesma fila offline
  (IndexedDB) do Módulo 1 para o registro de etapas de fronteira sem rede.
- **Migration** `0003_modulo2_tms_operacional.sql` — estende o enum
  `status_viagem` (`ALTER TYPE ... ADD VALUE`), cria `status_viagem_historico`,
  promove `eventos_fronteira` e `documentos_embarque` de stub para tabelas
  operacionais completas (enums próprios, colunas novas, RLS operacional
  substituindo a política `stub_admin_full_*`).
- **Não verificado nesta sessão**: sem Supabase real disponível, as
  migrations e políticas de RLS foram revisadas por leitura cuidadosa
  (nomes de coluna, tipos de FK, sintaxe), mas não executadas contra um
  banco vivo.

## Módulo 3 — Controle Financeiro do Frete

Tratado como tabelas próprias (`fretes`, `frete_lancamentos`,
`status_frete_historico`, `pagamentos_frete`) ligadas 1:1 à viagem (índice
único parcial em `fretes.viagem_id`), em vez de campos soltos em `viagens` —
decisão registrada nos comentários da migration. Um frete só pode ser criado
quando a viagem correspondente já está `ENTREGUE` ou `ENCERRADA`.

- **Frete contratado** (`apps/api/src/modules/fretes`) — cabeçalho comercial
  com valor contratado, número de fatura e os dados do **frete de retorno
  vazio** (critério #4): `retorno_vazio` (o veículo volta vazio ou com carga
  de backhaul), `valor_custo_retorno_vazio` e `valor_frete_retorno` — prontos
  para alimentar os indicadores de eficiência de frota do Módulo 4 (km
  vazio), sem implementá-los aqui.
  - `POST /api/v1/viagens/:viagemId/frete` / `GET /api/v1/viagens/:viagemId/frete`
  - `GET/POST /api/v1/fretes`, `GET/PATCH/DELETE /api/v1/fretes/:id`
- **Fechamento da viagem** — máquina de estados explícita
  (`TRANSICOES_STATUS_FECHAMENTO_FRETE`, em `packages/shared`):
  `ABERTO -> EM_CONFERENCIA -> APROVADO -> PAGO`, com `REJEITADO` como
  retrabalho de volta a `EM_CONFERENCIA`. Transições fora do grafo retornam
  `422`; transições existentes mas fora do papel do usuário retornam `403`
  (novo `ForbiddenTransitionError`) — **só ADMIN/SUPERADMIN aprovam
  financeiramente e confirmam o pagamento** (`PAPEIS_TRANSICAO_FECHAMENTO_FRETE`),
  OPERADOR conduz a conferência operacional. A transição para `PAGO` exige
  saldo do frete ≤ 0. Toda transição grava uma linha em
  `status_frete_historico`.
  - `PATCH /api/v1/fretes/:id/status`, `GET /api/v1/fretes/:id/status-history`
- **Saldo do frete** (critério #3) — calculado dinamicamente (nunca
  persistido) a partir de `frete_lancamentos` (adiantamento/desconto/multa)
  e dos pagamentos confirmados em `pagamentos_frete`:
  `saldo = contratado - adiantamentos - descontos - multas - pago_confirmado`.
  - `GET /api/v1/fretes/:id/saldo`
  - `GET/POST /api/v1/fretes/:id/lancamentos`, `DELETE /api/v1/fretes/:id/lancamentos/:lancamentoId`
  - `GET/POST /api/v1/fretes/:id/pagamentos` (Lei 15.485/2026: pagamento em
    até 30 dias úteis)
- **Telas web** — `FretesListPage` (visão geral com filtro por estágio),
  `ViagemFechamentoPage` (`/viagens/:id/frete` — formulário de registro do
  frete contratado quando ainda não existe, ou o fluxo completo quando já
  existe), `FreteDetailPage` (`/fretes/:id`, acesso direto pela visão
  financeira) e o componente compartilhado `FreteWorkflowView` (saldo,
  transições disponíveis já filtradas por papel, lançamentos, pagamentos e
  histórico). Novos hooks: `useFretes`, `useFreteByViagem`, `useFreteDetail`,
  `useFreteStatusHistory`. Fila offline-first (IndexedDB) reaproveitada para
  `create-frete`/`update-frete` (só o cabeçalho comercial é enfileirável —
  transições de fechamento, lançamentos e pagamentos exigem validação de
  saldo/estado em tempo real e por isso são sempre online, mesmo padrão do
  Módulo 2 para a mudança de status da viagem).
- **Migration** `0004_modulo3_financeiro_frete.sql` — promove `fretes` e
  `pagamentos_frete` de stub (migration 0001) para tabelas operacionais
  completas, cria `frete_lancamentos` e `status_frete_historico`, e
  substitui as políticas `stub_admin_full_*` por RLS operacional (mesmo
  padrão de `apolices_seguro` para dado financeiro: OPERADOR sem escrita em
  lançamentos/pagamentos, e um `WITH CHECK` que impede OPERADOR de gravar
  `status_fechamento` fora de `ABERTO`/`EM_CONFERENCIA` diretamente no banco).
- **Bug encontrado nos Módulos 1/2** (não corrigido aqui, fora do escopo) —
  ver `docs/NOTES.md`: o helper `handleDomainError` desses controllers
  sempre responde HTTP 400, mesmo para erros 404/409/422, porque chama
  `reply.status(x)` depois de `reply.send()` (sem efeito no Fastify). O
  Módulo 3 usa um helper corrigido, isolado neste módulo.
- **Não verificado nesta sessão**: mesma ressalva do Módulo 2 — migrations e
  RLS revisadas por leitura cuidadosa, não executadas contra um Supabase
  real.

## Módulo 4 — Controle de Frota e Jornada

Duas partes independentes, ligadas às entidades dos Módulos 1–3 sem alterar
nenhum arquivo de negócio desses módulos.

**A. Controle de Frota** (`apps/api/src/modules/frota`)

- Nova tabela `manutencoes_veiculo` (tipo, data, custo, km do veículo,
  previsão da próxima manutenção por data e/ou km).
- `viagens` ganha 3 colunas próprias do Módulo 4 (`km_rodado`, `km_vazio`,
  `consumo_combustivel_litros`), escritas por um endpoint dedicado
  (`PATCH /api/v1/frota/viagens/:viagemId/quilometragem`) — nenhum arquivo do
  Módulo 2 é alterado. "Km vazio" nunca duplica `fretes.retorno_vazio`
  (Módulo 3): os KPIs cruzam os dois sinais via JOIN em memória.
- `GET /api/v1/frota/kpis?veiculoId=&periodStart=&periodEnd=` — agrega km
  rodado/vazio, custo/km (considera apenas manutenção nesta fase — sem
  integração de preço de combustível ainda), consumo médio (km/l), % de
  ocupação e veículos disponíveis x em viagem (derivado do status atual de
  `viagens`, sem coluna própria).
- `GET/POST /api/v1/frota/manutencoes`, `GET/PATCH/DELETE /api/v1/frota/manutencoes/:id`.
- **Telas web**: `FrotaKpiPage` (dashboard + formulário de registro de
  quilometragem), `ManutencoesListPage`/`ManutencaoFormPage`/`ManutencaoDetailPage`.

**B. Controle de Jornada — foco ADI 5322** (`apps/api/src/modules/jornada`)

- Nova tabela `registros_jornada`: log contínuo e **imutável** de eventos
  (`INICIO_JORNADA`, `INICIO_DIRECAO`/`FIM_DIRECAO`,
  `INICIO_ESPERA`/`FIM_ESPERA`, `INICIO_DESCANSO`/`FIM_DESCANSO`,
  `FIM_JORNADA`), vinculado a `motoristas` e opcionalmente a `viagens`.
  Substitui os dois stubs da migration 0001 (`jornadas_motorista`,
  `registros_ponto`) — ver nota de modelagem na migration 0005. Máquina de
  estados explícita (`PROXIMO_EVENTO_JORNADA_VALIDO`) impede eventos fora de
  ordem (ex: `FIM_DIRECAO` sem um `INICIO_DIRECAO` em aberto).
- Motor de conformidade puro e testado (`jornadaCompliance.ts`, 6 testes
  `vitest`) reconstrói sessões de jornada a partir do log bruto e avalia
  duas regras centrais da ADI 5322: **tempo de espera conta como jornada**
  (a duração da sessão é sempre a diferença bruta entre início e fim, nunca
  descontando a espera) e **descanso mínimo de 11h consecutivas, não
  fracionável** (soma de pausas curtas que juntas alcançam 11h é sinalizada
  como violação BLOQUEANTE se nenhum bloco isolado atinge o mínimo).
  Complementarmente, sinaliza excesso de tempo de direção (> 10h — Lei
  13.103/2015) e de jornada total (> 13h). Achados estruturados
  (campo/severidade/mensagem — nunca um booleano), mesmo formato de
  `AchadoValidacao` do Módulo 2.
- `POST /api/v1/jornada/eventos` (insert-only — sem rota de edição; correção
  é feita por um novo evento, preservando a integridade probatória do
  histórico), `DELETE /api/v1/jornada/eventos/:id` (restrito a SUPERADMIN).
- `GET /api/v1/jornada/motoristas/:motoristaId/historico?periodStart=&periodEnd=&format=json|csv` —
  histórico consolidado (sessões + achados), exportável em CSV como
  evidência (critério "reduzir a exposição trabalhista").
- `GET /api/v1/jornada/alertas` — motoristas ativos com achados de risco
  (AVISO/BLOQUEANTE) nos últimos 7 dias (configurável).
- **Telas web**: `JornadaRegistroPage` (log de eventos + eventos recentes do
  motorista selecionado), `JornadaAlertasPage` (painel de alertas),
  `JornadaHistoricoPage` (histórico consolidado + exportação CSV).
- Fila offline-first (IndexedDB) estendida com `create-manutencao-veiculo`,
  `update-quilometragem-viagem` e `create-registro-jornada` — essencial para
  o registro de jornada em fronteira/estrada sem sinal.
- **RBAC**: leitura de indicadores/histórico/alertas aberta a todos os
  papéis (sem dado financeiro sensível). Escrita de manutenções e
  quilometragem segue o padrão operacional de `veiculos`
  (SUPERADMIN/ADMIN/OPERADOR). OPERADOR **pode** registrar eventos de
  jornada em tempo real (mesmo sem poder aprovar fretes) — decisão
  registrada aqui: o log é insert-only para esse papel, sem UPDATE, e a
  exclusão fica restrita a SUPERADMIN, preservando a integridade probatória
  do histórico.
- **Migration** `0005_modulo4_frota_jornada.sql` — cria `manutencoes_veiculo`
  e `registros_jornada`, adiciona as 3 colunas de quilometragem/consumo em
  `viagens`, remove os stubs `jornadas_motorista`/`registros_ponto`.
- **Não verificado nesta sessão**: mesma ressalva dos Módulos 2/3 —
  migrations e RLS revisadas por leitura cuidadosa, não executadas contra um
  Supabase real. O motor de conformidade (`jornadaCompliance.ts`), por ser
  lógica pura sem dependência de banco, **foi** executado e testado
  (`vitest`).

## Módulo 5 — WMS (Armazém Geral)

Serviço independente de guarda/conferência/reembalagem de mercadoria de
terceiros (Decreto 1.102/1903), vendido pela Rigabras a clientes terceiros no
armazém coberto de 5.500 m² (ver base de conhecimento). Módulo autocontido em
`apps/api/src/modules/wms`, montado sob `/api/v1/wms`; não altera nenhum
arquivo dos Módulos 1–4.

**Decisões de modelagem** (detalhadas na migration `0006` e em
`docs/NOTES.md`, para os Módulos 6/7 que constroem em cima destas tabelas):

- **`depositantes` ≠ clientes de frete**: entidade própria (razão
  social/CNPJ/contato), independente de um eventual cliente de transporte dos
  Módulos 1–4 (que hoje é texto livre em `viagens`/`fretes`, sem tabela
  própria). Um mesmo cliente pode ser as duas coisas, mas nunca há FK entre
  as duas modelagens.
- **Inventário como ledger imutável**: `movimentacoes_estoque` é a fonte da
  verdade (insert-only, sem UPDATE/DELETE além de SUPERADMIN — mesmo padrão
  de `registros_jornada` no Módulo 4), com 10 tipos de evento (`RECEBIMENTO`,
  `ENDERECAMENTO`, `SEPARACAO`, `REEMBALAGEM`, `ETIQUETAGEM`,
  `TRANSFERENCIA`, `CROSS_DOCKING`, `EXPEDICAO`, `AVARIA`,
  `AJUSTE_INVENTARIO`). A tabela `estoque` (saldo por produto x endereço) é
  um **saldo materializado**, sempre calculado a partir do ledger pelas
  funções puras de `estoqueLedger.ts` (13 testes `vitest`) — nunca editado
  diretamente. O inventário/contagem física reconcilia o saldo contado contra
  o ledger e só altera o estoque através de novos lançamentos
  `AJUSTE_INVENTARIO` (nunca um update silencioso).
- **Chaves estáveis para o Módulo 6 (integração TMS+WMS, fora do escopo
  desta sessão)**: `movimentacoes_estoque.tipo_movimentacao` inclui
  `'CROSS_DOCKING'`/`'EXPEDICAO'` como valores estáveis, e `expedicoes.
viagem_id` já existe (nullable, preenchida apenas pelo Módulo 6) para casar
  uma expedição do armazém com uma viagem do TMS.

**Fluxos e endpoints** (todos sob `/api/v1/wms`):

- `GET/POST/PATCH/DELETE /depositantes`, `/produtos`, `/enderecos` — CRUD de
  cadastro (depositantes, catálogo de SKU por depositante, endereços/bins do
  armazém — área/rua/prateleira/posição).
- `GET /armazens` — leitura dos armazéns físicos (tabela `armazens`, migration
  0001).
- **Recebimento e Conferência**: `POST /recebimentos` (cabeçalho + itens
  esperados) → `POST /recebimentos/:id/iniciar-conferencia` →
  `PATCH /recebimentos/:id/itens/:itemId/conferir` (quantidade conferida +
  endereçamento, gera uma movimentação `RECEBIMENTO`) →
  `POST /recebimentos/:id/concluir` (status final `CONFERIDO`/`ENDERECADO`/
  `DIVERGENTE`, conforme os itens).
- **Separação/Reembalagem/Etiquetagem/Cross-docking/Expedição**:
  `POST /expedicoes` (normal ou cross-docking) →
  `POST /expedicoes/:id/iniciar-separacao` →
  `PATCH /expedicoes/:id/itens/:itemId/separar` (gera `SEPARACAO` ou
  `CROSS_DOCKING` no ledger) →
  `PATCH /expedicoes/:id/itens/:itemId/reembalagem-etiquetagem` (gera
  `REEMBALAGEM`/`ETIQUETAGEM`, eventos de rastreabilidade) →
  `.../concluir-separacao` → `.../pronta-expedicao` → `.../expedir` (evento
  final `EXPEDICAO`) — máquina de estados explícita
  (`TRANSICOES_STATUS_EXPEDICAO`), com `.../cancelar` a qualquer momento
  antes de `EXPEDIDA`.
- **Controle de avarias**: `POST /avarias` (produto + severidade + endereço
  opcional) — gera uma movimentação `AVARIA` no ledger quando associada a um
  endereço.
- **Inventário**: `POST /inventarios` (snapshota o saldo atual de todos os
  endereços do armazém) → `POST /inventarios/:id/iniciar-contagem` →
  `PATCH /inventarios/:id/contagem` (contagem física item a item) →
  `POST /inventarios/:id/reconciliar` (**restrito a ADMIN/SUPERADMIN** — gera
  os ajustes `AJUSTE_INVENTARIO` calculados por `calcularAjustesInventario`)
  → `.../encerrar`.
- **KPIs e rastreabilidade**:
  `GET /kpis?armazemId=&periodStart=&periodEnd=` — % de ocupação do armazém,
  giro de estoque (expedido no período / saldo médio — aproximado pelo saldo
  atual total, já que não há snapshots históricos de saldo nesta fase),
  avarias por severidade, recebimentos/expedições em aberto.
  `GET /produtos/:produtoId/rastreio` e
  `GET /movimentacoes/:movimentacaoId/rastreio` — histórico completo de
  movimentações de um produto/uma movimentação (critério "traceability").
- **Telas web**: `DepositantesListPage`/`DepositanteFormPage`,
  `ProdutosListPage` (+ `RastreioProdutoPage`), `ArmazemMapaPage` (mapa de
  ocupação área/rua/prateleira/posição), `RecebimentosListPage`/
  `RecebimentoFormPage`/`RecebimentoDetailPage` (workflow de conferência),
  `ExpedicoesListPage`/`ExpedicaoFormPage`/`ExpedicaoDetailPage` (workflow de
  separação/expedição), `AvariasListPage`, `WmsKpiPage` (dashboard).
- Fila offline-first (IndexedDB) estendida com `create-depositante` e
  `create-avaria` (mesma fila dos demais módulos, nunca uma fila paralela).
- **RBAC**: leitura (cadastros, mapa de ocupação, KPIs, rastreabilidade)
  aberta a todos os papéis, inclusive VISITANTE. Trabalho de piso
  (recebimento/conferência, separação/expedição, avarias, abertura/contagem
  de inventário) liberado para OPERADOR. A **reconciliação de inventário**
  (gera ajustes de estoque com efeito financeiro/contratual sobre o
  depositante) fica restrita a ADMIN/SUPERADMIN — mesmo racional da
  aprovação financeira do Módulo 3. Exclusão de cadastros restrita a
  ADMIN/SUPERADMIN.
- **Migration** `0006_modulo5_wms_armazem_geral.sql` — cria `depositantes`,
  `produtos_armazenados`, `enderecos_armazem`, `estoque`, `recebimentos` (+
  itens), `expedicoes` (+ itens), `inventarios` (+ itens), `avarias`, e
  substitui os stubs `estoque_itens`/`movimentacoes_estoque` da migration
  0001 pelo ledger completo.
- **Testes**: `estoqueLedger.test.ts` (13 testes `vitest`) cobrindo o cálculo
  de delta de saldo por tipo de movimentação, ocupação, giro de estoque e o
  cálculo de ajustes de inventário — lógica pura, sem dependência de banco.
- **Não verificado nesta sessão**: mesma ressalva dos Módulos 2–4 —
  migrations e RLS revisadas por leitura cuidadosa, não executadas contra um
  Supabase real.

## Módulo 6 — Integração TMS + WMS

Liga o TMS (Módulos 1–4) ao WMS (Módulo 5) nos dois sentidos pedidos pelo
prompt. Nenhuma tabela nova; apenas as colunas mínimas listadas na migration
`0007_modulo6_modulo7_integracao_tms_wms_erp.sql`.

- **Expedição → Viagem ("mercadoria pronta para coleta") — implementado e
  testável ponta a ponta.** Uma expedição pode ser vinculada a uma viagem na
  criação (`viagem_id` opcional em `POST /wms/expedicoes`) ou depois
  (`PATCH /wms/expedicoes/:id/vincular-viagem`). Quando essa expedição é
  marcada `PRONTA_EXPEDICAO`
  (`ExpedicoesService.marcarProntaExpedicao`), o serviço:
  1. Busca a viagem vinculada e valida que seu status está em
     `STATUS_VIAGEM_COMPATIVEIS_COM_WMS_PRONTA` (`PROGRAMADA`,
     `AGUARDANDO_COLETA`, `EM_COLETA`) — **antes** de transicionar a
     expedição, nunca depois (uma viagem já `EM_TRANSITO`/além rejeita a
     marcação com **409 Conflict**, nunca persiste um estado inconsistente).
  2. Grava uma **nota WMS** na linha do tempo da própria viagem
     (`status_viagem_historico`, reaproveitando a tabela existente do
     Módulo 2 — nenhuma tabela de eventos nova) com `origem_evento = 'WMS'`
     e `status_anterior = status_novo` (não é uma transição de fato, é só uma
     nota informativa visível na `ViagemDetailPage`, com um badge amarelo
     "WMS" distinguindo-a de uma transição real).
- **Entrega → Recebimento — implementado, honestamente parcial.** Quando uma
  viagem transiciona para `ENTREGUE` e está marcada
  `destino_armazem_rigabras = true`, `ViagensService.changeStatus` chama
  `RecebimentosService.criarAutomaticoDeViagem`, que cria (de forma
  idempotente — reaproveita se já existir um recebimento para aquela
  `viagem_id`) o **cabeçalho** de um recebimento: depositante (de
  `viagens.depositante_id`, campo novo mínimo), referência (`numero_crt`),
  data prevista e observações com os dados de carga já conhecidos pelo TMS
  (peso, origem/destino). **O que continua manual, por limitação real de
  dados, não por preguiça**: o TMS não detalha SKU/quantidade da carga
  transportada (`viagens` guarda isso como texto livre/peso agregado), então
  os itens do recebimento continuam sendo lançados na conferência pelo
  armazém, exatamente como em um recebimento aberto manualmente. A automação
  **nunca bloqueia a confirmação de entrega**: se `depositante_id` não
  estiver preenchido na viagem, a viagem é marcada `ENTREGUE` normalmente e
  uma nota WMS explica por que o recebimento não pôde ser criado — nada
  falha silenciosamente.
- **`GET /viagens/:id/wms-status`** — status cruzado: expedição e/ou
  recebimento do armazém vinculados a essa viagem, quando existirem.
  Consumido pela `ViagemDetailPage` (seção "Integração com o armazém");
  `ExpedicaoDetailPage`/`RecebimentoDetailPage` também mostram a viagem
  vinculada, quando houver, com link direto.
- **RBAC**: leitura do status cruzado aberta a todos os papéis (mesmo padrão
  do histórico de status). Vincular expedição↔viagem é operacional
  (OPERADOR+); a nota WMS e a criação automática do recebimento não passam
  por um endpoint HTTP direto (são efeito colateral de transições já
  protegidas pelo RBAC existente dos Módulos 2 e 5).
- **Migration** `0007_modulo6_modulo7_integracao_tms_wms_erp.sql` —
  `status_viagem_historico.origem_evento` (enum `MANUAL`/`WMS`, default
  `MANUAL`, retrocompatível), `viagens.destino_armazem_rigabras` (boolean,
  default `false`), `viagens.depositante_id` (FK opcional para
  `depositantes`), `recebimentos.viagem_id` (FK opcional para `viagens`).
  `expedicoes.viagem_id` já existia desde a migration 0006.
- **Não verificado nesta sessão**: mesma ressalva dos Módulos 2–5 — migration
  revisada por leitura cuidadosa, não executada contra um Supabase real.

## Módulo 7 — Integração ERP

Nenhum ERP real existe para integrar nesta fase, então este módulo é uma
**abstração interna limpa e documentada**: um contrato único (`ErpAdapter`)
com uma implementação concreta (`InternalCsvJsonAdapter`) que lê diretamente
do Supabase — um adapter de ERP real (SAP, TOTVS, Sankhya etc., citados
apenas como exemplos comuns na logística brasileira; **nenhum implementado
aqui**) substituiria essa classe implementando a mesma interface, sem exigir
nenhuma mudança em rota/controller/service.

- **`apps/api/src/modules/erpExport/`**:
  - `erpAdapter.ts` — interface `ErpAdapter` (`exportFinanceiro`/
    `exportEstoque`, ambos recebendo `{ inicio, fim }`) — o ponto de extensão
    documentado.
  - `internalCsvJsonAdapter.ts` — única implementação concreta hoje: busca
    fretes do Módulo 3 criados no período e recalcula o saldo reaproveitando
    `FretesService.computeSaldo` (nunca duplica a lógica de saldo já usada
    pela tela financeira), e busca movimentações do ledger `movimentacoes_estoque`
    do Módulo 5 no período, com SKU/depositante via join em
    `produtos_armazenados`.
  - `erpExport.mapper.ts` — funções **puras** (sem I/O) que moldam
    frete+saldo e movimentação+produto nos tipos de exportação
    (`ErpFinanceiroRecord`/`ErpEstoqueRecord`) — testadas isoladamente do
    Supabase (`erpExport.mapper.test.ts`, 7 testes).
  - `erpExport.service.ts` — orquestra, depende apenas da interface
    `ErpAdapter` (nunca de `InternalCsvJsonAdapter` diretamente).
  - `erpExport.controller.ts`/`erpExport.routes.ts` —
    `GET /api/v1/erp-export/financeiro?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&formato=csv|json`
    e o equivalente `/estoque`. `formato=json` retorna o array tipado
    diretamente; `formato=csv` retorna um anexo baixável (mesmo padrão do
    histórico de jornada do Módulo 4).
- **RBAC**: `GET /erp-export/*` restrito a **ADMIN/SUPERADMIN** — mesmo
  sendo rotas de leitura, exportar em lote dados financeiros e de estoque é
  justamente o tipo de operação sensível que o RBAC granular existe para
  restringir.
- **Frontend**: `ExportacoesPage` (`/exportacoes`) — escolhe tipo
  (financeiro/estoque) e período, com botões "Visualizar (JSON)" (tabela na
  própria tela) e "Baixar CSV" (download real via `apiFetchBlob`). Loading/
  error/empty states no mesmo padrão das demais telas; a tela também se
  auto-oculta para papéis que sabidamente não têm acesso (a garantia real
  continua sendo o 403 do backend).
- **Não verificado nesta sessão**: nenhuma tabela nova, então nenhuma
  migration a verificar; a lógica de mapeamento (a parte determinística) tem
  cobertura de teste unitário, mas o `internalCsvJsonAdapter.ts` (I/O
  Supabase) não foi exercitado contra um banco real.

## Stack

- **apps/web**: React 19 + TypeScript + Vite + Tailwind CSS + Lucide + PWA
  (`vite-plugin-pwa`) com fila de escrita offline em IndexedDB (`idb`).
- **apps/api**: Node.js + TypeScript + Fastify, Zod, RFC 7807, JWT + refresh
  rotativo, RBAC, pino, `@fastify/rate-limit`, `@fastify/helmet`.
- **packages/shared**: Zod schemas + tipos inferidos, consumidos via
  `workspace:*` por `web` e `api`.
- **supabase**: migrations SQL numeradas + seed, sem CLI/provisionamento
  automático (aplicação manual em um projeto Supabase real).
- **IA**: Groq (`groq-sdk`), endpoint `POST /api/v1/viagens/:id/analise-risco`.

## Papéis (RBAC)

| Papel        | Acesso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPERADMIN` | Total, incluindo exclusão de apólices/perfis/pagamentos de frete, exclusão de eventos de jornada (Módulo 4), exclusão de cadastros do WMS (Módulo 5) e exportação ERP (Módulo 7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ADMIN`      | Total, exceto exclusão de apólices/perfis/pagamentos de frete e exclusão de eventos de jornada (reservadas a SUPERADMIN); inclui a reconciliação de inventário do WMS (Módulo 5) e a exportação ERP (Módulo 7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `OPERADOR`   | Leitura/escrita em viagens, veículos, motoristas, eventos de risco, cabeçalho de fretes (inclusive conferência operacional: `ABERTO→EM_CONFERENCIA`, `REJEITADO→EM_CONFERENCIA`), manutenções de veículo, quilometragem/consumo por viagem, **registro (insert-only) de eventos de jornada** e o trabalho de piso do WMS (recebimento/conferência, separação/expedição, avarias, abertura/contagem de inventário) — **sem** acesso de escrita a apólices/seguro, lançamentos financeiros (adiantamento/desconto/multa) ou pagamentos, **sem** poder aprovar financeiramente (`→APROVADO`)/confirmar pagamento (`→PAGO`) de um frete, **sem** poder editar/excluir um evento de jornada já lançado, e **sem** poder reconciliar um inventário do WMS |
| `VISITANTE`  | Somente leitura em tudo (inclusive KPIs de frota, alertas/histórico de jornada, KPIs/mapa de ocupação do WMS e o status cruzado TMS+WMS do Módulo 6), exceto escrita em apólices, em qualquer dado dos Módulos 3, 4 e 5, e sem acesso à exportação ERP do Módulo 7 (restrita a ADMIN/SUPERADMIN)                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Categorias de usuário e permissões por módulo

Tela **Usuários** (só `SUPERADMIN`), com duas abas:

- **Usuários** — criar, editar (nome, papel, categoria, status, senha, permissões), excluir.
  Excluir remove a conta de vez; se ela tiver histórico vinculado (viagens, fretes...), a
  exclusão é lógica: some da lista, o profile fica inativo e a conta é bloqueada no Supabase
  Auth. Recriar o mesmo e-mail depois reativa essa conta.
- **Categorias** — grupos (ex.: "Financeiro", "Portaria noturna") com os módulos que liberam
  (catálogo em `packages/shared/src/permissoes.ts`).

Regra de acesso: o **papel** define o que a pessoa pode fazer (ler/registrar/aprovar); os
**módulos** definem onde ela entra. Permissões próprias do usuário (quando definidas) vencem as
da categoria; sem categoria nem permissões próprias, vale tudo o que o papel permite (o
comportamento de antes). `SUPERADMIN` sempre acessa tudo. A API aplica a regra
(`requireModulo` em `routes/index.ts`, com leitura cruzada para telas que exibem dados de
outro módulo, como o Painel lendo `/frota/kpis`); o front esconde o menu e bloqueia a rota.
Os módulos vão no access token (`mods`), então uma mudança vale no próximo login ou na próxima
renovação do token (até 15 min).

**Banco:** requer a migration `supabase/migrations/0013_categorias_permissoes.sql` (tabela
`categorias_usuario`, colunas `profiles.categoria_id`/`profiles.permissoes` e o trigger que
impede um usuário comum de alterar o próprio `role`/`ativo`/categoria via Supabase direto).
Enquanto ela não for aplicada, login, usuários e o resto do sistema funcionam normalmente e a
aba Categorias mostra o aviso para aplicá-la.

## Status do `pnpm install` e `git init`

Ver relatório final da sessão de scaffolding para o resultado exato do
`pnpm install` (rede pode não estar disponível no ambiente de build) e a
confirmação do commit inicial do Git.
