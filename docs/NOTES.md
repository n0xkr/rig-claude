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

## 3. Controle Financeiro do Frete
- Tabelas: `fretes`, `pagamentos_frete`.
- Pendente: fechamento de viagem, saldo do frete, aprovação financeira,
  conformidade com a Lei 15.485/2026 (pagamento em até 30 dias úteis).

## 4. Controle de Frota e Jornada (foco ADI 5322)
- Tabelas: `jornadas_motorista`, `registros_ponto`.
- Pendente: registro contínuo de jornada, cômputo de tempo de espera como
  jornada (STF ADI 5322), alertas de excesso, indicadores de frota (km
  rodado/vazio, custo/km, consumo, ocupação).

## 5. WMS (Armazém Geral)
- Tabelas: `armazens`, `estoque_itens`, `movimentacoes_estoque`.
- Pendente: recebimento/conferência/endereçamento, separação, reembalagem,
  cross-docking, controle de avarias e inventário, giro de estoque.

## 6. Integração TMS + WMS
- Pendente por completo — depende dos módulos 2 e 5 estarem implementados.

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
