# Notas por módulo — escopo desta sessão

Esta sessão implementou **integralmente** o Módulo 1 (Gerenciamento de Risco):
schema Supabase + RLS, API Fastify completa (CRUD viagens/veiculos/motoristas/
eventos_risco/apolices_seguro + endpoint de análise de risco via Groq), e o
frontend PWA (lista/criação/detalhe de viagens com estados de loading/empty/
error e fila offline em IndexedDB).

Os módulos abaixo foram **scaffolded apenas no nível de schema de banco de
dados** (tabelas `STUB` em `supabase/migrations/0001_initial.sql`, com RLS
mínima em `0002_rls_policies.sql`). Nenhuma rota de API ou tela foi construída
para eles nesta sessão — ficam para sessões futuras, seguindo a ordem
estratégica definida no arquivo de critérios do projeto.

## 2. TMS Operacional (Fronteira / Documentação de embarque)
- Tabelas: `documentos_embarque`, `eventos_fronteira`.
- Pendente: fluxo de validação cruzada CRT × Fatura × MIC/DTA × Veículo ×
  Viagem, KPIs de fronteira (tempo parado, desembaraço, retenção, custo da
  espera), rotas de API e telas dedicadas.

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
