# Notas por módulo — escopo desta sessão

Esta sessão implementou **integralmente** o Módulo 1 (Gerenciamento de Risco):
schema Supabase + RLS, API Fastify completa (CRUD viagens/veiculos/motoristas/
eventos_risco/apolices_seguro + endpoint de análise de risco via Groq), e o
frontend PWA (lista/criação/detalhe de viagens com estados de loading/empty/
error e fila offline em IndexedDB).

Uma sessão subsequente implementou **integralmente o Módulo 2 (TMS
Operacional)** em cima da mesma entidade `viagens` — ver seção dedicada no
`README.md` para o detalhamento completo de rotas, schema e telas. Resumo:

## 2. TMS Operacional (Fronteira / Documentação de embarque) — IMPLEMENTADO
- **Máquina de estados estendida da viagem** (critério #1): enum
  `status_viagem` ampliado via `0003_modulo2_tms_operacional.sql` para
  Programação → Coleta (Aguardando/Em coleta) → Documentação →
  Veículo/Motorista definido → Validação pré-embarque → Viagem (trânsito) →
  Fronteira → Monitoramento → Entrega → Encerramento, com `CANCELADA` como
  saída em quase todos os estados. Transições inválidas retornam 422
  (Problem Details); toda transição válida grava uma linha em
  `status_viagem_historico` (trilha de auditoria dedicada, além do
  `audit_logs` geral). API: `PATCH /viagens/:id/status`,
  `GET /viagens/:id/status-history`.
- **Travessia de fronteira** (critério #2): tabela `eventos_fronteira`
  promovida de stub a operacional (enum `etapa_fronteira`: Agendamento →
  Chegada → Gate → Fiscalização → Desembaraço → Saída → Liberação), cada
  etapa timestampada com tempo parado, motivo de retenção, retrabalho
  documental e custo estimado da espera. API:
  `GET/POST /viagens/:id/fronteira/eventos`,
  `GET /fronteira/kpis` (agregação em memória de tempo parado, tempo de
  desembaraço, retenções, retrabalho documental e custo, por viagem e por
  rota).
- **Validação cruzada pré-embarque** (critério #3): tabela
  `documentos_embarque` promovida de stub a operacional (enum
  `tipo_documento_embarque`: CRT, MIC/DTA, Fatura, DU-E, DUIMP). Serviço
  `ValidacaoPreEmbarqueService` cruza CRT × Fatura × MIC/DTA × veículo ×
  motorista × viagem e retorna uma lista estruturada de achados
  (`AchadoValidacao[]`, severidade INFO/AVISO/BLOQUEANTE), não apenas um
  booleano. API: `POST /viagens/:id/validacao-pre-embarque`.
- **Telas React**: `ViagemDetailPage` (linha do tempo do ciclo de vida com
  histórico de status), `FronteiraTravessiaPage` (registro de etapas +
  KPIs da viagem), `FronteiraKpiPage` (performance por rota, filtro por
  rota), `ValidacaoPage` (resultado estruturado da validação). A fila
  offline-first (IndexedDB) do Módulo 1 foi reaproveitada para o registro
  de etapas de fronteira (`create-evento-fronteira`), sem uma segunda fila.

## 3. Controle Financeiro do Frete — IMPLEMENTADO

Uma terceira sessão implementou **integralmente o Módulo 3 (Controle
Financeiro do Frete)** em cima da entidade `viagens` (Módulos 1/2) — ver a
seção dedicada no `README.md` para o detalhamento completo de rotas, schema e
telas. Resumo:

- **Frete contratado** (`fretes`, relação 1:1 com `viagens` via índice único
  parcial em `viagem_id`): promovido de stub (migration 0001) a tabela
  operacional completa na `0004_modulo3_financeiro_frete.sql`. Só pode ser
  criado quando a viagem já está `ENTREGUE` ou `ENCERRADA`.
- **Fechamento da viagem** (máquina de estados explícita, critério #1):
  `ABERTO -> EM_CONFERENCIA -> APROVADO -> PAGO`, com `REJEITADO` como
  retrabalho de volta a `EM_CONFERENCIA`. Transições inexistentes retornam
  422; transições existentes fora do papel do usuário retornam 403 (novo
  `ForbiddenTransitionError`) — só ADMIN/SUPERADMIN aprovam financeiramente e
  confirmam pagamento (`PAPEIS_TRANSICAO_FECHAMENTO_FRETE`). Toda transição
  grava uma linha em `status_frete_historico`.
- **Saldo do frete** (critério #3): calculado dinamicamente (nunca
  persistido) a partir de `frete_lancamentos` (adiantamento/desconto/multa) e
  `pagamentos_frete` confirmados — `GET /fretes/:id/saldo`.
- **Frete de retorno vazio** (critério #4): colunas `retorno_vazio`,
  `valor_custo_retorno_vazio` e `valor_frete_retorno` em `fretes`, prontas
  para alimentar os indicadores de eficiência de frota do Módulo 4 (km
  vazio) sem implementá-los aqui.
- **Descoberta durante esta sessão**: o helper `handleDomainError` usado nos
  controllers dos Módulos 1/2 (`viagens`, `fronteira`, `eventosRisco`,
  `veiculos`, `motoristas`, `documentosEmbarque`, `validacaoPreEmbarque`,
  `apolices`) sempre responde `400` via `Problems.badRequest(...).status(...)`
  — chamar `.status()` depois de `.send()` não tem efeito no Fastify (`send`
  já serializa o status code), então **todo `DomainError` desses módulos hoje
  volta como HTTP 400**, mesmo quando deveria ser 404/409/422. Confirmado com
  um teste isolado (`reply.status(400).send(...); reply.status(422)` →
  `res.statusCode` continua `400`). O módulo 3 usa um helper corrigido
  (`sendProblem(reply, error.status, ...)`), mas os módulos 1/2 não foram
  alterados (fora do escopo daquela sessão).

  **CORRIGIDO em sessão subsequente** (a mesma que implementou o Módulo 4):
  os 8 controllers listados acima passaram a usar `sendProblem(reply,
  error.status, error.message, error.detail)`, exatamente como `fretes`. A
  correção foi verificada com `fastify.inject()` construindo duas rotas
  fastify mínimas lado a lado (padrão antigo x novo) usando as classes de
  erro reais (`NotFoundError`, `ConflictError`) e os helpers reais
  (`Problems`, `sendProblem`): antes, `NotFoundError` (status 404) e
  `ConflictError` (status 409) resultavam em `res.statusCode === 400` nos
  dois casos; depois, `res.statusCode` passou a ser `404` e `409`
  respectivamente, com o campo `status` do corpo JSON também correto. Nenhum
  arquivo de rota/service/repository foi alterado, apenas a função
  `handleDomainError` (e a troca do import `Problems` → `sendProblem`) em
  cada um dos 8 `*.controller.ts`.

## 4. Controle de Frota e Jornada (foco ADI 5322) — IMPLEMENTADO

Uma sessão subsequente implementou **integralmente o Módulo 4 (Controle de
Frota e Jornada)** em cima das entidades dos Módulos 1–3 — ver a seção
dedicada no `README.md` para o detalhamento completo de rotas, schema e
telas. Resumo:

- **Controle de Frota** (`apps/api/src/modules/frota`): nova tabela
  `manutencoes_veiculo` (tipo/data/custo/km/próxima manutenção); 3 colunas
  próprias do Módulo 4 em `viagens` (`km_rodado`, `km_vazio`,
  `consumo_combustivel_litros`), escritas por um endpoint dedicado do Módulo
  4 (nenhum arquivo do Módulo 2 é tocado); KPIs agregados (km rodado/vazio,
  custo/km — apenas manutenção nesta fase, sem preço de combustível ainda —,
  consumo médio, ocupação, disponíveis x em viagem). "Km vazio" cruza (nunca
  duplica) `fretes.retorno_vazio` do Módulo 3 via JOIN em memória.
- **Controle de Jornada** (`apps/api/src/modules/jornada`): nova tabela
  `registros_jornada`, log contínuo e **imutável** de eventos (início/fim de
  jornada, direção, espera, descanso), substituindo os stubs
  `jornadas_motorista`/`registros_ponto` (ver nota de modelagem na migration
  0005). Máquina de estados explícita valida a sequência de eventos.
  Motor de conformidade puro (`jornadaCompliance.ts`, 6 testes `vitest`)
  aplica as duas regras centrais da ADI 5322: tempo de espera conta como
  jornada (nunca descontado do total) e descanso mínimo de 11h consecutivas,
  não fracionável (soma de pausas curtas não substitui um bloco contínuo).
  Endpoints de histórico consolidado (exportável em CSV) e de alertas de
  conformidade entre motoristas ativos.
- **RBAC**: OPERADOR registra eventos de jornada em tempo real, mas o log é
  insert-only para esse papel (sem UPDATE); exclusão restrita a SUPERADMIN,
  preservando a integridade probatória do histórico (decisão de produto
  documentada no cabeçalho da migration 0005 e no README).
- **Telas web**: `FrotaKpiPage`, `ManutencoesListPage`/`ManutencaoFormPage`/`ManutencaoDetailPage`,
  `JornadaRegistroPage`, `JornadaAlertasPage`, `JornadaHistoricoPage`. Fila
  offline-first estendida com 3 novos tipos de mutação.
- **Migration** `0005_modulo4_frota_jornada.sql`.
- **Não verificado nesta sessão**: mesma ressalva dos Módulos 2/3 —
  migrations e RLS revisadas por leitura cuidadosa, não executadas contra um
  Supabase real. O motor de conformidade, por não depender de banco, foi
  executado e testado.

## 5. WMS (Armazém Geral) — IMPLEMENTADO

Uma sessão subsequente implementou **integralmente o Módulo 5 (WMS — Armazém
Geral, Decreto 1.102/1903)** em `apps/api/src/modules/wms`, montado sob
`/api/v1/wms` — ver a seção dedicada no `README.md` para o detalhamento
completo de rotas, schema e telas. Resumo das decisões de modelagem chave
(documentadas também no cabeçalho da migration `0006`), para os Módulos 6/7
que vão construir em cima destas tabelas:

- **`depositantes` ≠ clientes de frete**: o Armazém Geral vende um serviço
  distinto (guarda/conferência/reembalagem de mercadoria de terceiros) do
  frete rodoviário internacional dos Módulos 1–4. `depositantes` é uma
  tabela própria (razão social/CNPJ/contato), **nunca** uma FK para uma
  tabela de "clientes de frete" — que hoje nem existe como entidade própria
  (`viagens`/`fretes` guardam o cliente como texto livre). Um mesmo cliente
  real pode ser as duas coisas ao mesmo tempo, mas são papéis independentes
  no sistema.
- **Inventário como ledger imutável, nunca um campo mutável solto**:
  `movimentacoes_estoque` é a fonte da verdade — cada linha é um evento de
  estoque imutável (insert-only, sem policy de UPDATE/DELETE além de
  SUPERADMIN, mesmo padrão de `registros_jornada` no Módulo 4), com 10 tipos
  (`RECEBIMENTO`, `ENDERECAMENTO`, `SEPARACAO`, `REEMBALAGEM`,
  `ETIQUETAGEM`, `TRANSFERENCIA`, `CROSS_DOCKING`, `EXPEDICAO`, `AVARIA`,
  `AJUSTE_INVENTARIO`). A tabela `estoque` (saldo por produto x endereço) é
  um **saldo materializado**, mantido pela camada de serviço
  (`EstoqueRepository.registrarMovimentacao`) a cada movimentação, calculado
  pelas funções puras de `estoqueLedger.ts` (nunca editado "à mão" fora
  desse fluxo). O inventário (`POST /inventarios/:id/reconciliar`) sempre
  reconcilia o saldo contado fisicamente contra o ledger e qualquer
  divergência vira uma **nova** linha `AJUSTE_INVENTARIO` — nunca um update
  silencioso do saldo.
- **Chaves estáveis para o Módulo 6 (integração TMS+WMS)**: os valores
  `'CROSS_DOCKING'` e `'EXPEDICAO'` de `movimentacoes_estoque.
  tipo_movimentacao`, e a coluna `expedicoes.viagem_id` (nullable, hoje
  nunca preenchida por este módulo) existem justamente para que o futuro
  Módulo 6 consiga casar uma expedição do armazém com uma viagem do TMS sem
  precisar renomear ou remodelar nada aqui.
- **`avarias` referencia `movimentacoes_estoque`, não o contrário**: para
  evitar uma dependência circular entre as duas tabelas na migration
  (`avarias.movimentacao_id` aponta para o evento `AVARIA` do ledger que
  registrou a baixa de estoque), `movimentacoes_estoque` é criada **antes**
  de `avarias` — e depois de `inventarios` (que ela também referencia via
  `inventario_id`). A ordem de criação das tabelas na migration 0006 segue
  estritamente essa dependência.
- **RBAC**: leitura aberta a todos os papéis (cadastros, mapa de ocupação,
  KPIs, rastreabilidade — sem dado financeiro sensível). OPERADOR cobre todo
  o trabalho de piso (recebimento/conferência, separação/expedição, avarias,
  abertura e contagem de inventário). A **reconciliação de inventário**
  (`POST /inventarios/:id/reconciliar`), que gera ajustes de estoque com
  efeito financeiro/contratual sobre o depositante, fica restrita a
  ADMIN/SUPERADMIN — mesmo racional da aprovação financeira do Módulo 3.
- **Telas web**: `DepositantesListPage`/`DepositanteFormPage`,
  `ProdutosListPage`/`RastreioProdutoPage`, `ArmazemMapaPage` (ocupação),
  `RecebimentosListPage`/`RecebimentoFormPage`/`RecebimentoDetailPage`,
  `ExpedicoesListPage`/`ExpedicaoFormPage`/`ExpedicaoDetailPage`,
  `AvariasListPage`, `WmsKpiPage`. Fila offline-first estendida com
  `create-depositante` e `create-avaria`.
- **Migration** `0006_modulo5_wms_armazem_geral.sql` — substitui os stubs
  `estoque_itens`/`movimentacoes_estoque` da migration 0001 pelo modelo
  completo acima; `armazens` (migration 0001) é mantida como está.
- **Testes**: `estoqueLedger.test.ts` (13 testes `vitest`, lógica pura sem
  dependência de banco) cobrindo o delta de saldo por tipo de movimentação
  (entrada/saída/transferência/ajuste), % de ocupação, giro de estoque e o
  cálculo de ajustes de inventário (aumento/redução/sem ajuste).
- **Giro de estoque — simplificação documentada**: como este módulo não
  mantém snapshots históricos de saldo, o "saldo médio do período" usado no
  cálculo de giro é aproximado pelo saldo **atual** total dos endereços do
  armazém filtrado — uma evolução futura com séries temporais de saldo
  diário daria um saldo médio mais preciso.
- **Não verificado nesta sessão**: mesma ressalva dos Módulos 2–4 —
  migrations e RLS revisadas por leitura cuidadosa, não executadas contra um
  Supabase real.

## 6. Integração TMS + WMS
- Pendente por completo — depende dos módulos 2 e 5 estarem implementados
  (Módulo 5 **já está** implementado nesta sessão; ver seção 5 acima para as
  chaves estáveis deixadas prontas: `movimentacoes_estoque.
  tipo_movimentacao IN ('CROSS_DOCKING','EXPEDICAO')` e
  `expedicoes.viagem_id`).

## 7. Integração ERP
- Pendente por completo — fora do escopo desta fase (o projeto ainda não
  depende de webhooks externos, conforme decisão registrada no prompt
  original: "a princípio não dependerá de webhooks externos, somente RLS do
  Supabase").

## Observação sobre integrações de rastreamento
O prompt original menciona uma evolução futura: dados inicialmente vindos de
integração com Google Sheets, depois integração direta com o Autotrac Prime
(rastreamento da frota Scania/Randon da Rigabras). A coluna
`veiculos.rastreador_autotrac_id` já existe no schema para suportar essa
evolução, mas nenhuma integração foi implementada nesta sessão.
