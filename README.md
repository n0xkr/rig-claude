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
**Módulo 1 — Gerenciamento de Risco**. Os módulos 2–7 (TMS Operacional,
Financeiro do Frete, Frota e Jornada, WMS, integração TMS+WMS, integração
ERP) estão **scaffolded apenas no nível de schema de banco de dados** — ver
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
│   ├── migrations/   0001_initial.sql, 0002_rls_policies.sql
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
#    supabase/seed.sql   (opcional, apenas dev)

# 4. Rodar em desenvolvimento (api + web em paralelo)
pnpm dev
# api:  http://localhost:3333  (healthz: /healthz, readyz: /readyz)
# web:  http://localhost:5173
```

## Mapeamento dos 17 Critérios de Excelência de Produção

| # | Critério | Status nesta sessão |
|---|----------|----------------------|
| 1 | Funcionalidade | **Satisfeito (Módulo 1)** — CRUD completo de viagens/veículos/motoristas/eventos_risco/apólices, máquina de estados explícita (`TRANSICOES_STATUS_VIAGEM`), UseCases isolados em `*.service.ts`. Idempotência/debounce de cliques: **parcial** — schema suporta, dedupe de submissão dupla no formulário web não implementado nesta sessão. |
| 2 | Interface e UX | **Satisfeito (parcial)** — loading/empty/error states implementados nas telas de viagens; responsividade básica via Tailwind. Busca com debounce, filtros multi-critério avançados e modais de confirmação: **deferidos**. |
| 3 | Dados | **Satisfeito** — soft delete, timestamps UTC, função `uuid_generate_v7()` (aproximação PL/pgSQL, upgrade documentado para `pg_uuidv7`), índices em FKs, migrations numeradas, `audit_logs` implementada e escrita em toda mutação do Módulo 1. |
| 4 | Segurança | **Satisfeito (parcial)** — JWT de 15 min + refresh rotativo em cookie httpOnly, RBAC 4 papéis, RLS Supabase, Zod em todas as rotas, rate limit (100/min geral, 5/min em `/login`), Helmet. Hash de senha é delegado ao Supabase Auth (não usamos Argon2/Bcrypt próprios). |
| 5 | Backend/API | **Satisfeito** — rotas `/api/v1/...`, RFC 7807 em todos os erros, `/healthz` e `/readyz`. Header `Idempotency-Key`: **deferido** (não implementado nesta sessão). |
| 6 | Performance | **Deferido** — sem Redis/cache nesta fase (não provisionado), paginação por cursor implementada nas listagens, mas sem Brotli/Gzip configurado na API (o Nginx do frontend faz gzip). Code-splitting: básico via Vite. |
| 7 | Confiabilidade | **Satisfeito (parcial)** — graceful shutdown (SIGINT/SIGTERM). Circuit breaker para chamadas externas (Groq) e transações multi-tabela explícitas: **deferidos**. Backup automatizado do banco: fora do escopo (gerido pelo Supabase). |
| 8 | Integrações | **Não aplicável nesta fase** — decisão de produto registrada no prompt original: sem webhooks externos por enquanto, apenas RLS do Supabase. Groq é chamado de forma síncrona, sem fila BullMQ. |
| 9 | Observabilidade | **Satisfeito** — logs JSON estruturados (pino), Correlation-ID por requisição propagado em log e header de resposta. Tracing distribuído: **deferido**. |
| 10 | Testes | **Deferido** — `vitest` configurado no `package.json` da API, porém nenhum teste unitário/integração foi escrito nesta sessão. |
| 11 | DevOps | **Satisfeito (parcial)** — Dockerfiles multi-stage Alpine para api e web, validação de env no boot com `process.exit(1)`. Pipeline de CI (lint→typecheck→test→build): **deferido** (nenhum arquivo de workflow criado). |
| 12 | Documentação | **Satisfeito (parcial)** — este README, `docs/NOTES.md` por módulo. OpenAPI/Swagger vivo e dicionário de dados formal: **deferidos**. |
| 13 | Escalabilidade | **Satisfeito (parcial)** — API stateless (sessão via JWT, não em memória do processo), pronta para múltiplas réplicas atrás de LB. Filas de workers dedicados: **deferido** (não há BullMQ/Redis configurado). |
| 14 | Administração | **Deferido** — painel de administração com métricas de negócio, gestão de usuários e consulta de auditoria via UI não foram construídos (a tabela `audit_logs` existe e é gravada, mas sem tela de consulta). |
| 15 | Qualidade de Código | **Satisfeito** — TypeScript `strict: true` em todos os workspaces, arquitetura em camadas, zero credenciais hardcoded (tudo via `.env`). |
| 16 | Produção | **Deferido** — TLS/domínio, subnet privada de banco e rollback automático pós-deploy dependem da infraestrutura de hospedagem (Coolify) e não foram configurados neste scaffold. |
| 17 | Definition of Done | **Parcial** — Módulo 1 está Implementado → Integrado → Validado (Zod) → Seguro (RBAC/RLS) → Persistindo → Tratando erros (RFC 7807) → Monitorado (logs). **Testado** e **Pronto para produção** (TLS, CI, backups) ainda não. |

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

| Papel | Acesso |
|---|---|
| `SUPERADMIN` | Total, incluindo exclusão de apólices/perfis |
| `ADMIN` | Total, exceto exclusão de apólices/perfis |
| `OPERADOR` | Leitura/escrita em viagens, veículos, motoristas, eventos de risco — **sem** acesso a apólices/seguro |
| `VISITANTE` | Somente leitura em tudo, exceto apólices (leitura permitida, sem escrita) |

## Status do `pnpm install` e `git init`

Ver relatório final da sessão de scaffolding para o resultado exato do
`pnpm install` (rede pode não estar disponível no ambiente de build) e a
confirmação do commit inicial do Git.
