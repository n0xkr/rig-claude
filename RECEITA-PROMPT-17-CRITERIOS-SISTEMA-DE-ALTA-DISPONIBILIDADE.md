---
title: "Sistema de Alta Disponibilidade"
author: "Engenheiro de Software Mestre"
framework: "17 Critérios de Excelência de Produção"
definition_of_done: "10 Etapas Obrigatórias"
exported_at: "27/09/2026"
---

# PROJETO: Sistema a ser concebido: Ecossistema Integrado de Gestão Logística (TMS e WMS). Problema crítico que resolve: A dependência de controles manuais e fragmentados no processo operacional da Rigabras, transformando etapas analógicas em fluxos digitais, gerando dados estruturados e prevendo integrações ponta a ponta (TMS, WMS e ERP).  1. Ordem Estratégica de Implementação O desenvolvimento seguirá uma esteira lógica para estruturar a operação e os dados antes de escalar para as integrações financeiras e administrativas:  Gerenciamento de Risco  TMS Operacional  Controle Financeiro do Frete  Controle de Frota e Jornada  WMS (Armazém Geral)  Integração TMS + WMS  Integração ERP  2. Módulo TMS (Transport Management System) Sistema desenvolvido localmente (contextualizado pelos arquivos do diretório) para controle de rastreamento de veículos e gerenciamento de risco.  Fluxo Digital Alvo: Programação → Coleta → Documentação → Veículo/Motorista → Validação → Viagem → Monitoramento → Eventos → Entrega → Encerramento.  Substituição de Atividades Manuais:  Datas (Programação do embarque, Ordem de coleta, Coleta).  Dados de Identificação (Nº do CRT, Placa do cavalo, Controle do veículo/carretas).  Acompanhamento e Eventos (Início da viagem, Rastreamento, Gestão de risco, Monitoramento de eventos).  Fronteira e Conclusão (Controle de chegada/saída de fronteira, Entrega, Encerramento da viagem).  3. Módulo de Fronteira e Validação Documental Transformação da travessia de fronteira em um processo mensurável, previsível e preventivo.  Validação Pré-Embarque: Cruzamento automatizado de dados (CRT × Fatura × MIC/DTA × Dados do Veículo × Dados da Viagem) para identificar inconsistências antes da chegada do caminhão à fronteira.  KPIs de Fronteira:  Fluxo de Passos: Agendamento → Chegada → Gate → Fiscalização → Desembaraço → Saída → Liberação.  Métricas de Desempenho: Tempo parado, Tempo de desembaraço, Retenção, Retrabalho documental, Motivo da retenção, Custo estimado da espera, Performance por viagem e Performance por rota.  4. Módulo WMS (Warehouse Management System) Sistema inicialmente independente, desenhado para suprir as oportunidades do Armazém Geral, com arquitetura preparada para futura integração com ERP e TMS.  Escopo Operacional:  Recebimento, Conferência e Endereçamento.  Gestão de Estoque e Movimentações.  Separação, Reembalagem e Etiquetagem.  Cross-docking, Consolidação e Expedição.  Escopo de Gestão:  Controle de avarias e Inventário.  Ocupação do armazém e Giro de estoque.  Rastreabilidade total das operações.  5. Controle Financeiro e Gestão de Frota Transformação do controle da frota em indicadores operacionais e financeiros claros.  Controle Financeiro do Frete: Frete contratado, Fechamento da viagem, Saldo do frete, Frete/valor relacionado ao veículo vazio, Conferência operacional, Aprovação financeira e Pagamento.  Indicadores Prioritários de Frota:  Quilometragem (Km rodado, Km vazio).  Custos e Eficiência (Custo/km, Consumo).  Utilização (Ocupação, Veículos disponíveis, Veículos em viagem).  Gestão de Ativos (Manutenção, Utilização da frota, Agregados × Frota própria).  6. Automação e Controle de Jornada (Foco na ADI 5322) Garantia de conformidade legal e mitigação de passivos trabalhistas.  Objetivos:  Registro contínuo da jornada e controle rigoroso de tempo de espera.  Identificação de excessos e alertas imediatos para situações de risco.  Geração de histórico consolidado para reduzir a exposição trabalhista da empresa.

pwa offline first, dpois sincroniza como memoria blackout,,,.,,,2 > primeiramente os dados virão da integração com o google sheets, depois integração diratamente com autotrac, arquitetura nova, modelo rigabras

eu vou criar com claude, fazer deploy no github, e abrir um projeto no coolify com resource github app private repository, entao dps te falo workflow para deploy automatico, mas primeiro foque no prompt para o projeto fullstack, usarei banco de dados supabase,.

1 sobre as validações atomicas, deixe para o claude decidir. , a principio não dependerá de webhooks externos, somente rls do supabase

tenha em vista que a i.a. utilizada sera do GROQ
## RECEITA PROMPT DO ENGENHEIRO DE SOFTWARE MESTRE (PADRÃO 17 CRITÉRIOS)

> **Papel da IA / Equipe:** Atue como Desenvolvedor Fullstack Sênior e Arquiteto de Software. Implemente esta solução com padrão de excelência de produção, código tipado, sem placeholders e com aderência estrita aos 17 critérios de qualidade.

### Stack Tecnológica Recomendada
- **Frontend:** React 19 + TypeScript + Tailwind CSS + Lucide Icons
- **Backend:** Node.js (TypeScript) + Express / Fastify com arquitetura em camadas
- **Banco de Dados:** PostgreSQL com ORM parametrizado (Drizzle ou Prisma) + Migrations versionadas
- **Cache & Filas:** Redis + BullMQ para tarefas assíncronas e retries
- **Segurança:** JWT com Refresh Tokens em HTTP-only cookies, Helmet, Rate Limiter e Zod

---

### ESPECIFICAÇÃO DETALHADA DOS 17 CRITÉRIOS

#### 1. Funcionalidade
- Requisitos funcionais divididos em User Stories claras com critérios de aceitação.
- Fluxo de ponta a ponta sem telas mortas ou ações bloqueantes sem feedback.
- CRUD completo com validações em duas vias (frontend e backend).
- Regras de negócio encapsuladas em UseCases ou Services puros, isoladas da camada HTTP.
- Máquina de estados explícita para status de registros (ex: PENDENTE -> PROCESSANDO -> CONCLUIDO / FALHA).
- Prevenção ativa contra cliques múltiplos usando chave de idempotência e debounce.

#### 2. Interface e UX
- Interface intuitiva com hierarquia tipográfica consistente e tema coeso.
- Totalmente responsiva para Mobile (<640px), Tablet (<1024px) e Desktop (>1024px).
- Tratamento explícito de todos os estados:
  - **Loading:** Skeletons animados dimensionados fielmente ao conteúdo final.
  - **Empty:** Mensagem amigável contextual com botão de ação rápida para criar o primeiro item.
  - **Error:** Card de erro com mensagem acionável e botão 'Tentar Novamente'.
- Busca com debounce (300ms), filtros multi-critério e ordenação dinâmica.
- Modais de confirmação para ações de exclusão ou alterações de status irreversíveis.

#### 3. Dados
- Schema relacional no PostgreSQL com integridade referencial estrita e ON DELETE RESTRICT / CASCADE explícitos.
- Chaves primárias com UUIDv7 para segurança contra enumeração e boa ordenação por tempo.
- Timestamps padrão em UTC (`created_at` com default NOW(), `updated_at`, `deleted_at` para soft delete).
- Índices B-Tree cobrindo chaves estrangeiras, campos de filtro frequente e ordenações.
- Migrações versionadas numeradas (`0001_initial.sql`, `0002_add_indexes.sql`) com suporte a rollback.
- Trilha de auditoria na tabela `audit_logs` registrando: `id`, `user_id`, `action`, `entity`, `entity_id`, `changes_json`, `ip`, `created_at`.

#### 4. Segurança
- Autenticação com senhas protegidas via Argon2id / Bcrypt (fator de custo 12).
- Tokens JWT de curta duração (15 min) + Refresh Token rotativo armazenado em banco.
- Controle de acesso baseado em papéis (RBAC): `SUPERADMIN`, `ADMIN`, `OPERADOR`, `VISITANTE`.
- Todas as consultas ao banco parametrizadas para imunidade contra SQL Injection.
- Sanitização de inputs para mitigação de XSS e headers de segurança via Helmet (CSP, HSTS).
- Rate Limiting configurado: 100 requisições por minuto por IP em rotas gerais e 5 por minuto em /login.
- Validação irrestrita de payloads via schemas Zod tanto na entrada de rotas quanto em retornos críticos.

#### 5. Backend/API
- Padrão RESTful com rotas semânticas e versionadas (`/api/v1/...`).
- Respostas de erro no padrão RFC 7807 (`Problem Details` com `type`, `title`, `status`, `detail`, `instance`).
- Status HTTP estritos: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Unprocessable Entity, 500 Internal Error.
- Suporte a cabeçalho `Idempotency-Key` para mutações financeiras ou sensíveis.
- Health checks padronizados: `/healthz` (liveness) e `/readyz` (conectividade de banco e cache).

#### 6. Performance
- Eliminação rigorosa de queries N+1 utilizando eager loading controlado ou JOINs otimizados.
- Cache de consultas frequentes no Redis com TTL estrito e invalidação orientada a eventos.
- Compactação Brotli/Gzip ativada no servidor web.
- Paginação baseada em cursor para tabelas com mais de 50.000 registros.
- Lazy loading de componentes pesados no frontend via code-splitting dinâmico.

#### 7. Confiabilidade
- Transações com isolamento READ COMMITTED / SERIALIZABLE em operações multi-tabela.
- Circuit breaker implementado para chamadas a APIs externas instáveis.
- Graceful shutdown do servidor interceptando SIGINT e SIGTERM, finalizando conexões ativas.
- Rotina automatizada de backup lógico do banco com retenção de 30 dias.

#### 8. Integrações
- Webhooks com validação de assinatura criptográfica HMAC SHA-256 no header da requisição.
- Fila assíncrona BullMQ com Dead Letter Queue (DLQ) e até 5 tentativas com backoff exponencial.
- Log completo do payload de envio e resposta de serviços externos com sanitização de credenciais.

#### 9. Observabilidade
- Logs estruturados em formato JSON com campos: `timestamp`, `level`, `correlation_id`, `module`, `message`, `metadata`.
- Middleware gerando Correlation-ID único propagado por toda a cadeia de requisições.
- Rastreamento de exceções com captura de stack trace sanitizado.

#### 10. Testes
- Testes unitários cobrindo 100% dos UseCases e funções de cálculo de negócio.
- Testes de integração cobrindo rotas HTTP, validação de payload e transações reais de banco de teste.
- Testes de segurança verificando que usuários não autenticados recebem 401 e sem permissão recebem 403.

#### 11. DevOps
- Pipeline de CI automatizado: Lint -> Typecheck -> Testes Unitários -> Build.
- Dockerfile multi-stage enxuto baseado em Alpine Linux sem dependências de desenvolvimento em produção.
- Variáveis de ambiente validadas no boot com parada imediata se faltar chave obrigatória.

#### 12. Documentação
- README com diagrama de arquitetura C4, comandos rápidos (`npm run dev`, `npm run test`, `npm run build`).
- Especificação OpenAPI (Swagger) viva gerada automaticamente a partir dos schemas de rota.
- Dicionário de dados documentando todas as colunas e regras de negócio de cada entidade.

#### 13. Escalabilidade
- Backend 100% stateless permitindo rodar N instâncias atrás de um Load Balancer.
- Filas de tarefas desacopladas executadas por workers dedicados.

#### 14. Administração
- Painel de administração com métricas de negócio em tempo real.
- Gerenciamento de usuários, revogação de acessos e consulta à trilha de auditoria.

#### 15. Qualidade de Código
- TypeScript em modo estrito (`strict: true`, `noImplicitAny: true`).
- Princípios SOLID e Clean Code respeitados sem complexidade desnecessária.
- Zero código morto, zero variáveis não utilizadas, zero credenciais hardcoded.

#### 16. Produção
- Domínio configurado com certificado SSL/TLS (Let's Encrypt / Cloudflare).
- Banco de dados em subnet privada sem acesso externo direto.
- Política de Rollback automático caso o container falhe no healthcheck pós-deploy.

#### 17. Critério de "Pronto" (Definition of Done)
Nenhum módulo é considerado pronto apenas porque a tela renderiza. Cada módulo só é dado como concluído quando:
**Implementado** → **Integrado** → **Validado** → **Testado** → **Seguro** → **Persistindo dados corretamente** → **Tratando erros** → **Monitorado** → **Documentado** → **Pronto para produção**.
