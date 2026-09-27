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
abaixo). Uma sessão subsequente também corrigiu um bug de status HTTP
encontrado nos controllers dos Módulos 1/2 — ver "Bug corrigido" abaixo. Os
módulos 5–7 (WMS, integração TMS+WMS, integração ERP) permanecem
**scaffolded apenas no nível de schema de banco de dados** — ver
[`docs/NOTES.md`](./docs/NOTES.md).

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
│   │                 0005_modulo4_frota_jornada.sql
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
#    supabase/migrations/0005_modulo4_frota_jornada.sql
#    supabase/seed.sql   (opcional, apenas dev)

# 4. Rodar em desenvolvimento (api + web em paralelo)
pnpm dev
# api:  http://localhost:3333  (healthz: /healthz, readyz: /readyz)
# web:  http://localhost:5173
```

## Mapeamento dos 17 Critérios de Excelência de Produção

| #   | Critério            | Status nesta sessão                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Funcionalidade      | **Satisfeito (Módulos 1, 2, 3 e 4)** — CRUD completo de viagens/veículos/motoristas/eventos_risco/apólices/fretes/manutenções, máquinas de estado explícitas: viagem (`TRANSICOES_STATUS_VIAGEM`, 12 status Programação→...→Encerramento), fechamento do frete (`TRANSICOES_STATUS_FECHAMENTO_FRETE`: ABERTO→EM_CONFERENCIA→APROVADO→PAGO, com REJEITADO como retrabalho) e log de jornada (`PROXIMO_EVENTO_JORNADA_VALIDO`, Módulo 4), todas com trilha de histórico dedicada (`status_viagem_historico`, `status_frete_historico`, o próprio `registros_jornada` imutável) além do `audit_logs` geral. UseCases isolados em `*.service.ts`. Idempotência/debounce de cliques: **parcial** — schema suporta, dedupe de submissão dupla no formulário web não implementado nesta sessão. |
| 2   | Interface e UX      | **Satisfeito (parcial)** — loading/empty/error states implementados nas telas de viagens e de fretes/fechamento financeiro; responsividade básica via Tailwind. Busca com debounce, filtros multi-critério avançados e modais de confirmação: **deferidos**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 3   | Dados               | **Satisfeito** — soft delete (`registros_jornada` é a única tabela imutável por design — ver seção Módulo 4), timestamps UTC, função `uuid_generate_v7()` (aproximação PL/pgSQL, upgrade documentado para `pg_uuidv7`), índices em FKs, migrations numeradas (0001–0005), `audit_logs` implementada e escrita em toda mutação dos Módulos 1, 2, 3 e 4.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 4   | Segurança           | **Satisfeito (parcial)** — JWT de 15 min + refresh rotativo em cookie httpOnly, RBAC 4 papéis reforçado em duas camadas (middleware da API + RLS do Supabase, inclusive **por transição de estado** no fechamento do frete — só ADMIN/SUPERADMIN aprovam/pagam — e **insert-only** no log de jornada do Módulo 4), Zod em todas as rotas, rate limit (100/min geral, 5/min em `/login`), Helmet. Hash de senha é delegado ao Supabase Auth (não usamos Argon2/Bcrypt próprios).                                                                                                                                                                                                                                                                                                          |
| 5   | Backend/API         | **Satisfeito** — rotas `/api/v1/...`, RFC 7807 em todos os erros dos Módulos 2/3/4 (o bug de status code do helper `handleDomainError` dos Módulos 1/2, descrito em `docs/NOTES.md`, foi **corrigido nesta sessão** em todos os 8 controllers afetados), `/healthz` e `/readyz`. Header `Idempotency-Key`: **deferido** (não implementado nesta sessão).                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 6   | Performance         | **Deferido** — sem Redis/cache nesta fase (não provisionado), paginação por cursor implementada nas listagens, mas sem Brotli/Gzip configurado na API (o Nginx do frontend faz gzip). Code-splitting: básico via Vite.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 7   | Confiabilidade      | **Satisfeito (parcial)** — graceful shutdown (SIGINT/SIGTERM). Circuit breaker para chamadas externas (Groq) e transações multi-tabela explícitas: **deferidos**. Backup automatizado do banco: fora do escopo (gerido pelo Supabase).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 8   | Integrações         | **Não aplicável nesta fase** — decisão de produto registrada no prompt original: sem webhooks externos por enquanto, apenas RLS do Supabase. Groq é chamado de forma síncrona, sem fila BullMQ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 9   | Observabilidade     | **Satisfeito** — logs JSON estruturados (pino), Correlation-ID por requisição propagado em log e header de resposta. Tracing distribuído: **deferido**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 10  | Testes              | **Satisfeito (parcial)** — motor de conformidade ADI 5322 do Módulo 4 (`jornadaCompliance.ts`) tem 6 testes unitários (`vitest`) cobrindo as regras centrais (espera conta como jornada, descanso fracionado, descanso contínuo válido, descanso insuficiente entre jornadas, excesso de direção/jornada, sessão em aberto). O bug de status HTTP dos Módulos 1/2 foi verificado com `fastify.inject()` comparando padrão antigo x novo. Cobertura de 100% dos UseCases/rotas HTTP: **deferida** para os demais módulos.                                                                                                                                                                                                                                                                 |
| 11  | DevOps              | **Satisfeito (parcial)** — Dockerfiles multi-stage Alpine para api e web, validação de env no boot com `process.exit(1)`. Pipeline de CI (lint→typecheck→test→build): **deferido** (nenhum arquivo de workflow criado).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 12  | Documentação        | **Satisfeito (parcial)** — este README, `docs/NOTES.md` por módulo. OpenAPI/Swagger vivo e dicionário de dados formal: **deferidos**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 13  | Escalabilidade      | **Satisfeito (parcial)** — API stateless (sessão via JWT, não em memória do processo), pronta para múltiplas réplicas atrás de LB. Filas de workers dedicados: **deferido** (não há BullMQ/Redis configurado).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 14  | Administração       | **Deferido** — painel de administração com métricas de negócio, gestão de usuários e consulta de auditoria via UI não foram construídos (a tabela `audit_logs` existe e é gravada, mas sem tela de consulta).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 15  | Qualidade de Código | **Satisfeito** — TypeScript `strict: true` em todos os workspaces, arquitetura em camadas, zero credenciais hardcoded (tudo via `.env`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 16  | Produção            | **Deferido** — TLS/domínio, subnet privada de banco e rollback automático pós-deploy dependem da infraestrutura de hospedagem (Coolify) e não foram configurados neste scaffold.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 17  | Definition of Done  | **Parcial** — Módulo 1 está Implementado → Integrado → Validado (Zod) → Seguro (RBAC/RLS) → Persistindo → Tratando erros (RFC 7807) → Monitorado (logs). **Testado** e **Pronto para produção** (TLS, CI, backups) ainda não.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

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

| Papel        | Acesso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPERADMIN` | Total, incluindo exclusão de apólices/perfis/pagamentos de frete e exclusão de eventos de jornada (Módulo 4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ADMIN`      | Total, exceto exclusão de apólices/perfis/pagamentos de frete e exclusão de eventos de jornada (reservadas a SUPERADMIN)                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `OPERADOR`   | Leitura/escrita em viagens, veículos, motoristas, eventos de risco, cabeçalho de fretes (inclusive conferência operacional: `ABERTO→EM_CONFERENCIA`, `REJEITADO→EM_CONFERENCIA`), manutenções de veículo, quilometragem/consumo por viagem e **registro (insert-only) de eventos de jornada** — **sem** acesso de escrita a apólices/seguro, lançamentos financeiros (adiantamento/desconto/multa) ou pagamentos, **sem** poder aprovar financeiramente (`→APROVADO`)/confirmar pagamento (`→PAGO`) de um frete, e **sem** poder editar ou excluir um evento de jornada já lançado |
| `VISITANTE`  | Somente leitura em tudo (inclusive KPIs de frota e alertas/histórico de jornada), exceto escrita em apólices e em qualquer dado dos Módulos 3 e 4                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Status do `pnpm install` e `git init`

Ver relatório final da sessão de scaffolding para o resultado exato do
`pnpm install` (rede pode não estar disponível no ambiente de build) e a
confirmação do commit inicial do Git.
