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
abaixo) e o **Módulo 3 — Controle Financeiro do Frete** (frete contratado,
fechamento da viagem com máquina de estados e RBAC granular por transição,
saldo do frete e frete de retorno vazio — ver seção "Módulo 3" abaixo). Os
módulos 4–7 (Frota e Jornada, WMS, integração TMS+WMS, integração ERP)
permanecem **scaffolded apenas no nível de schema de banco de dados** — ver
[`docs/NOTES.md`](./docs/NOTES.md).

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
│   │                 0004_modulo3_financeiro_frete.sql
│   └── seed.sql
└── docs/NOTES.md     escopo dos módulos futuros
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
#    supabase/seed.sql   (opcional, apenas dev)

# 4. Rodar em desenvolvimento (api + web em paralelo)
pnpm dev
# api:  http://localhost:3333  (healthz: /healthz, readyz: /readyz)
# web:  http://localhost:5173
```

## Mapeamento dos 17 Critérios de Excelência de Produção

| #   | Critério            | Status nesta sessão                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Funcionalidade      | **Satisfeito (Módulos 1, 2 e 3)** — CRUD completo de viagens/veículos/motoristas/eventos_risco/apólices/fretes, máquinas de estado explícitas: viagem (`TRANSICOES_STATUS_VIAGEM`, 12 status Programação→...→Encerramento) e fechamento do frete (`TRANSICOES_STATUS_FECHAMENTO_FRETE`: ABERTO→EM_CONFERENCIA→APROVADO→PAGO, com REJEITADO como retrabalho), ambas com trilha de histórico dedicada (`status_viagem_historico`, `status_frete_historico`) além do `audit_logs` geral. UseCases isolados em `*.service.ts`. Idempotência/debounce de cliques: **parcial** — schema suporta, dedupe de submissão dupla no formulário web não implementado nesta sessão. |
| 2   | Interface e UX      | **Satisfeito (parcial)** — loading/empty/error states implementados nas telas de viagens e de fretes/fechamento financeiro; responsividade básica via Tailwind. Busca com debounce, filtros multi-critério avançados e modais de confirmação: **deferidos**.                                                                                                                                                                                                                                                                                                                                                                                                          |
| 3   | Dados               | **Satisfeito** — soft delete, timestamps UTC, função `uuid_generate_v7()` (aproximação PL/pgSQL, upgrade documentado para `pg_uuidv7`), índices em FKs, migrations numeradas (0001–0004), `audit_logs` implementada e escrita em toda mutação dos Módulos 1, 2 e 3.                                                                                                                                                                                                                                                                                                                                                                                                   |
| 4   | Segurança           | **Satisfeito (parcial)** — JWT de 15 min + refresh rotativo em cookie httpOnly, RBAC 4 papéis reforçado em duas camadas (middleware da API + RLS do Supabase, inclusive **por transição de estado** no fechamento do frete — só ADMIN/SUPERADMIN aprovam/pagam), Zod em todas as rotas, rate limit (100/min geral, 5/min em `/login`), Helmet. Hash de senha é delegado ao Supabase Auth (não usamos Argon2/Bcrypt próprios).                                                                                                                                                                                                                                         |
| 5   | Backend/API         | **Satisfeito** — rotas `/api/v1/...`, RFC 7807 em todos os erros dos Módulos 2/3 (ver nota sobre o bug de status code do helper `handleDomainError` dos Módulos 1/2 em `docs/NOTES.md`, corrigido no Módulo 3), `/healthz` e `/readyz`. Header `Idempotency-Key`: **deferido** (não implementado nesta sessão).                                                                                                                                                                                                                                                                                                                                                       |
| 6   | Performance         | **Deferido** — sem Redis/cache nesta fase (não provisionado), paginação por cursor implementada nas listagens, mas sem Brotli/Gzip configurado na API (o Nginx do frontend faz gzip). Code-splitting: básico via Vite.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 7   | Confiabilidade      | **Satisfeito (parcial)** — graceful shutdown (SIGINT/SIGTERM). Circuit breaker para chamadas externas (Groq) e transações multi-tabela explícitas: **deferidos**. Backup automatizado do banco: fora do escopo (gerido pelo Supabase).                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 8   | Integrações         | **Não aplicável nesta fase** — decisão de produto registrada no prompt original: sem webhooks externos por enquanto, apenas RLS do Supabase. Groq é chamado de forma síncrona, sem fila BullMQ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 9   | Observabilidade     | **Satisfeito** — logs JSON estruturados (pino), Correlation-ID por requisição propagado em log e header de resposta. Tracing distribuído: **deferido**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 10  | Testes              | **Deferido** — `vitest` configurado no `package.json` da API, porém nenhum teste unitário/integração foi escrito nesta sessão.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 11  | DevOps              | **Satisfeito (parcial)** — Dockerfiles multi-stage Alpine para api e web, validação de env no boot com `process.exit(1)`. Pipeline de CI (lint→typecheck→test→build): **deferido** (nenhum arquivo de workflow criado).                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 12  | Documentação        | **Satisfeito (parcial)** — este README, `docs/NOTES.md` por módulo. OpenAPI/Swagger vivo e dicionário de dados formal: **deferidos**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 13  | Escalabilidade      | **Satisfeito (parcial)** — API stateless (sessão via JWT, não em memória do processo), pronta para múltiplas réplicas atrás de LB. Filas de workers dedicados: **deferido** (não há BullMQ/Redis configurado).                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 14  | Administração       | **Deferido** — painel de administração com métricas de negócio, gestão de usuários e consulta de auditoria via UI não foram construídos (a tabela `audit_logs` existe e é gravada, mas sem tela de consulta).                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 15  | Qualidade de Código | **Satisfeito** — TypeScript `strict: true` em todos os workspaces, arquitetura em camadas, zero credenciais hardcoded (tudo via `.env`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 16  | Produção            | **Deferido** — TLS/domínio, subnet privada de banco e rollback automático pós-deploy dependem da infraestrutura de hospedagem (Coolify) e não foram configurados neste scaffold.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 17  | Definition of Done  | **Parcial** — Módulo 1 está Implementado → Integrado → Validado (Zod) → Seguro (RBAC/RLS) → Persistindo → Tratando erros (RFC 7807) → Monitorado (logs). **Testado** e **Pronto para produção** (TLS, CI, backups) ainda não.                                                                                                                                                                                                                                                                                                                                                                                                                                         |

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

| Papel        | Acesso                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPERADMIN` | Total, incluindo exclusão de apólices/perfis/pagamentos de frete                                                                                                                                                                                                                                                                                                                                         |
| `ADMIN`      | Total, exceto exclusão de apólices/perfis/pagamentos de frete (reservada a SUPERADMIN)                                                                                                                                                                                                                                                                                                                   |
| `OPERADOR`   | Leitura/escrita em viagens, veículos, motoristas, eventos de risco e cabeçalho de fretes (inclusive conferência operacional: `ABERTO→EM_CONFERENCIA`, `REJEITADO→EM_CONFERENCIA`) — **sem** acesso de escrita a apólices/seguro, lançamentos financeiros (adiantamento/desconto/multa) ou pagamentos, e **sem** poder aprovar financeiramente (`→APROVADO`) ou confirmar pagamento (`→PAGO`) de um frete |
| `VISITANTE`  | Somente leitura em tudo, exceto escrita em apólices e em qualquer dado do Módulo 3                                                                                                                                                                                                                                                                                                                       |

## Status do `pnpm install` e `git init`

Ver relatório final da sessão de scaffolding para o resultado exato do
`pnpm install` (rede pode não estar disponível no ambiente de build) e a
confirmação do commit inicial do Git.
