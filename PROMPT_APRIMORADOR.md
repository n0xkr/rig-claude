# PROMPT APRIMORADOR

Auditoria evolutiva do projeto **Rigabras — Ecossistema Logístico (TMS + WMS)**, feita em 2026-09-30.
Este documento registra o diagnóstico, o que foi corrigido (com a validação de cada item) e, principalmente,
a **receita operacional** das melhorias que ainda faltam, escrita para que outro agente execute sem reconstruir o contexto.

> Convenções: `[x]` = implementado e validado nesta auditoria · `[ ]` = pendente (está na Receita, seção 16).
> Nenhum segredo real aparece aqui.

---

## 1. Resumo executivo

**O que o projeto faz.** Substitui os controles manuais da Rigabras Transportes (Uruguaiana/RS, transporte rodoviário
internacional TRIC + Armazém Geral) por um fluxo digital ponta a ponta: programação → coleta → documentação →
veículo/motorista → validação → viagem → fronteira/aduanas → entrega → fechamento financeiro, mais WMS (armazém),
portaria, jornada de motoristas, importação inteligente de planilhas e assistente de IA.

**Stack.** Monorepo pnpm (`pnpm@9`, Node ≥ 20):

| Pacote | Tecnologia |
| --- | --- |
| `apps/web` | React 19, Vite 5, React Router 6, Tailwind 3, framer-motion, three 0.169 + @react-three/fiber/drei, PWA (vite-plugin-pwa), idb (fila offline), xlsx, pdfjs |
| `apps/api` | Fastify 5, zod, pino, jsonwebtoken, Supabase (service-role), groq-sdk, vitest |
| `packages/shared` | Schemas zod, enums/status, regras de permissão, modelo de planilha (compartilhado web ↔ api) |
| `supabase/migrations` | 0001–0016 (SQL aplicado **manualmente** no Supabase) |
| `tests/e2e` | Playwright (16 specs) contra API com banco falso em memória |

Deploy: Dockerfiles por app (web = build estático + nginx; api = node) orquestrados pelo Coolify.

## 2. Contexto reconstruído

- **Fonte da verdade**: Supabase Postgres. A API usa a *service-role key* (ignora RLS); o front só usa a anon key para
  autenticação/sessão. RLS existe como segunda barreira para acesso direto via PostgREST.
- **Autenticação**: `/auth/login` → JWT de acesso (15 min, carrega `role` e `mods`) + refresh token rotativo em cookie
  httpOnly. O front guarda o access token em `localStorage` (`rigabras_access_token`).
- **Autorização**: papel (`SUPERADMIN > ADMIN > OPERADOR > VISITANTE`) via `requireRole` **e** módulos por categoria de
  usuário via `requireModulo` (`registrarModulo` em `apps/api/src/routes/index.ts`). SUPERADMIN ignora módulos.
- **Fluxo de uma viagem**: status em `FLUXO_STATUS_VIAGEM` (`packages/shared/src/enums.ts`), com transições validadas;
  grupos usados no painel: Em andamento / Na fronteira-aduanas / Programadas / Encerradas (`lib/viagemGrupos.ts`).
- **Importação inteligente**: planilha → padronização → consolidação por lote/viagem → gravação, sem mapeamento manual
  de colunas (decisão de produto; ver memória do projeto). Campos novos viram "campos personalizados".
- **Banco falso** (`USE_FAKE_DB=true`): cliente Supabase em memória para dev/testes sem Docker. Não é RLS real.

## 3. Arquitetura atual

```text
Browser (React SPA/PWA)
  ├─ pages/*  →  hooks/use*  →  lib/apiClient (fetch + JWT + refresh)  ──►  API Fastify /api/v1
  ├─ offline/  (IndexedDB: fila de mutações → syncManager)                   ├─ middleware: correlationId, authenticate, requireRole/requireModulo
  └─ components/3d, charts (three / r3f / SVG)                               ├─ modules/<dominio>: routes → controller → service → repository
                                                                              ├─ config/supabase (real | fakeSupabase)
                                                                              └─ Supabase Postgres (+ Storage, Auth)
packages/shared: schemas zod + enums + permissões  (importado por web e api)
```

Módulos da API: auth, usuarios, categorias, perfil, viagens, veiculos, motoristas, fronteira, documentosEmbarque,
validacaoPreEmbarque, eventosRisco, apolices, fretes, frota, jornada, wms (depositantes, produtos, recebimentos,
expedições, avarias, inventários, endereços, KPIs), portaria, importacao (+ inteligente), iaSolicitacoes, acompanhamento,
chatbot/groq, auditoria, adminDados (CRUD genérico SUPERADMIN), erpExport, camposPersonalizados.

## 4. Problemas encontrados

Base: 3 auditorias paralelas (gráficos/3D, segurança/backend, qualidade/UX) + leitura direta do código.
Situação: ✅ corrigido aqui · 📋 na Receita (seção 16) · 🔧 ação operacional sua.

| ID | Prio | Arquivo | Problema | Impacto | Solução | Situação |
| -- | ---- | ------- | -------- | ------- | ------- | -------- |
| A-01 | P0 | `auth.service.ts`, RLS 0002/0004/0008 | Cadastro público cria VISITANTE ativo, e as policies dão SELECT amplo a VISITANTE (CPF/RG de motoristas, fretes, apólices, portaria, bucket `portaria-documentos`). A anon key é pública | Qualquer pessoa cria conta e lê dados de negócio direto no PostgREST, contornando módulos | (a) flag `ALLOW_PUBLIC_REGISTRATION=false`; (b) desligar signup no Supabase Auth; (c) retirar VISITANTE das policies sensíveis (R-01) | ✅ flag · 🔧 (a)(b) · 📋 (c) |
| A-02 | P0 | `.mcp.json`, `apps/api/.env` | Segredos reais (PAT Supabase, token Coolify, service-role, JWT) em texto puro numa pasta sincronizada pelo OneDrive (ignorados pelo git, mas copiados para a nuvem) | Vazamento de conta inteira | Rotacionar tokens; mover projeto para fora do OneDrive ou excluir `.env`/`.mcp.json`/`backup-*.json` da sincronização | 🔧 |
| A-03 | P1 | `app.ts` | `allowList:['127.0.0.1']` + `trustProxy:true`: `X-Forwarded-For: 127.0.0.1` forjado desligava todo rate limit (inclusive 5/min do login) | Brute force de senha / spam de contas | allowList só fora de produção; `TRUST_PROXY_HOPS` configurável | ✅ |
| A-04 | P1 | RLS 0002/0013 | ADMIN podia se promover a SUPERADMIN via PostgREST (trigger liberava ADMIN) | Escalada de privilégio | Migration 0016: só SUPERADMIN altera role/ativo/categoria/permissões | ✅ arquivo · 🔧 aplicar |
| A-05 | P1 | RLS 0002 | `current_user_role()` ignorava `ativo=false` | Usuário desativado seguia com acesso direto | Migration 0016 (`ativo is not false`) | ✅ arquivo · 🔧 aplicar |
| A-06 | P1 | `auth.service.ts` | Refresh token sem checagem de `type`, sem `algorithms`, sem revogação/uso de `jti`; logout não invalida | Refresh roubado vale 7 dias | `type==='refresh'` e HS256 fixados ✅; revogação com `jti` 📋 (R-02) | ✅ parcial · 📋 |
| A-07 | P1 | `motoristas.routes.ts` | Rotas de motoristas (PII) fora da guarda de módulos | Usuário de categoria sem o módulo lia CPF/CNH/documentos | `requireModulo` (motoristas ou viagens; leitura por módulos relacionados) | ✅ |
| D-01 | P1 | `useViagens.ts` | `GET /viagens` sem `limit`/`cursor`: só as 20 viagens mais recentes; "Em trânsito" e a malha 3D ficavam errados em silêncio | Indicadores incorretos | Paginação por cursor (200 × 10 págs), guarda de resposta obsoleta | ✅ |
| D-02 | P1 | `fleetGraph.ts` | Viagem com origem = destino contada 2×; tetos de nós/rotas/caminhões silenciosos; `MOVING_STATUS.includes` O(n) | Contagens/peso inflados, dados sumindo sem aviso | Dedup, `Set`, contadores de omitidos exibidos na UI | ✅ |
| D-03 | P1 | `Dashboard3DBarChart.tsx` | `data` novo a cada render recriava o WebGL inteiro (risco de perder contexto); sem fallback sem WebGL; sem `forceContextLoss`; loop rAF sempre ativo; ignorava reduced-motion; sem rótulos/interação | Flicker, vazamento de contexto, inacessível | Reescrito (seção 8) | ✅ |
| S-01 | P2 | `groq.client.ts` | Sem timeout/retry explícitos (até ~3 min por request de IA) | Requests presos, custo | `timeout: 25s, maxRetries: 1` | ✅ |
| S-02 | P2 | `adminDados.service.ts` | `fetch` do OpenAPI sem timeout | Travamento | `AbortSignal.timeout(10s)` | ✅ |
| S-03 | P2 | `groq.client.ts` | Log da resposta bruta do modelo (OCR de CNH contém CPF/RG) | PII em logs | Só 200 primeiros caracteres | ✅ |
| S-04 | P2 | `lib/csv.ts` | CSV sem proteção a *formula injection* (`= + - @`) | Execução de fórmula no Excel com dado importado | Prefixo `'` (números não afetados) + testes | ✅ |
| S-05 | P2 | `env.ts` | `USE_FAKE_DB=true` aceito em produção | Banco em memória sem persistência em prod | `superRefine` recusa | ✅ |
| S-06 | P2 | `correlationId.ts` | `X-Correlation-Id` do cliente sem validação | Log poisoning | Regex `^[\w.:-]{1,100}$` | ✅ |
| S-07 | P2 | `vite.config.ts` / logout | Service worker cacheia `/api/v1` (NetworkFirst 24h) sem separar usuários | Dados do usuário anterior offline | Logout limpa caches `*api*` | ✅ |
| S-08 | P2 | `nginx.conf` | Sem Referrer-Policy/Permissions-Policy/`server_tokens off`; `add_header` em `location` descartava os do `server`; sem cache imutável de `/assets`; `sw.js` cacheável | Headers ausentes, PWA sem atualizar | Reescrito (seção 9) | ✅ (CSP 📋 R-05) |
| S-09 | P2 | vários | Endpoints de IA/OCR/importação sem rate limit dedicado; upload de motorista sem magic-bytes; buckets sem limite; `chatbot.repository` trunca em 1000 linhas; `portaria` valida `storage_path` com `startsWith` | Custo, DoS, totais errados | Ver R-03, R-04, R-06 | 📋 |
| S-10 | P2 | web | Access token em `localStorage` e sem CSP | Roubo de token em caso de XSS | R-05 | 📋 |
| U-01 | P2 | `DashboardLayout.tsx` | Drawer mobile sem `role=dialog`, Esc, `aria-current`, `aria-expanded`; sem "pular para o conteúdo"; polling em aba oculta | A11y e rede | Corrigido | ✅ |
| U-02 | P2 | `UsuariosPage`, `GerenciarDadosPage` | Modais duplicados sem Esc/`aria-modal` | A11y | `components/ui/Modal.tsx` | ✅ |
| U-03 | P2 | `StateViews.tsx`, `index.css` | `ErrorCard` sem `role=alert`; leitura dupla no loading; foco quase invisível; sem `prefers-reduced-motion` | A11y | Corrigido | ✅ |
| U-04 | P2 | `FrotaKpiPage`, `ProdutosListPage` | Inputs só com placeholder | A11y | `aria-label` | ✅ (demais telas 📋 R-07) |
| P-01 | P1 | `App.tsx`, `vite.config.ts` | Todas as páginas importadas estaticamente (chunk principal 1,17 MB) e `manualChunks` de three/r3f faziam o `index.html` pré-carregar ~1,2 MB de WebGL no login | Primeira carga lenta | `React.lazy` nas rotas + manualChunks só de motion | ✅ (1,17 MB → 401 KB; preload só de motion) |
| Q-01 | P3 | web | Fluxo de importação antigo sem rota (≈1.375 linhas) | Código morto | Removido | ✅ |
| Q-02 | P2 | web | ~28 hooks `useX` com o mesmo esqueleto; 48 `toLocale*` espalhados; `Info/Kpi/Field` duplicados; sem cache/dedup de requisições | Manutenção e chamadas repetidas | R-08, R-09, R-10 | 📋 |
| Q-03 | P3 | api | `isSchemaAusente` em `lib/permissoes.ts` (11 importadores); dois tradutores de erro do Postgres | Coesão | R-11 | 📋 |
| T-01 | P2 | api | Teste de integração de usuários estourava o timeout de hook (10 s) quando rodava em paralelo | Suíte instável | `vitest.config.ts` (60 s) | ✅ |

## 5. Redundâncias

**Removido (verificado por grep, sem rota nem import):**
- `apps/web/src/pages/ImportarPlanilhaIaPage.tsx`, `apps/web/src/hooks/useImportacaoIa.ts`, `apps/web/src/components/AiImportWizard.tsx`
  (fluxo antigo de importação, substituído pela importação inteligente).
- `Spinner` (StateViews), `accentText` (GlassCard), `RetornoVazioChip` (FreteWorkflowView) — exports sem uso.
- Ramo `hdrUrl`/`opaque`/`HdriBoundary` de `HDRIEnvironment.tsx` (nunca exercitado; o componente tem um único chamador).
- Modal duplicado em `UsuariosPage` e `GerenciarDadosPage` → `components/ui/Modal.tsx`.

**Ainda existente (Receita):**
- Lado API do fluxo antigo: `POST /importacoes/ia/analisar`, `importacao.ia.ts` e `/importacoes/lotes/*` ficaram sem consumidor no front (confirmar nos e2e antes de apagar) — R-12.
- Hooks sem uso: `useInventarios.ts` (4 hooks; não há tela de inventário), `useDepositanteDetail`, `useUpdateDepositante`,
  `useUpdateEnderecoStatus`, `useUpdateFrete`, `useImportacaoActions`; `InventarioStatusBadge`, `OrdemServicoStatusBadge`;
  `onQueueChange`/`queueUpdateViagem` (infra da fila offline, mantidos de propósito) — R-12.
- Componentes locais repetidos: `Info` (5×), `Kpi` (5×), `Field` (4×) — R-10.
- Formatadores locais (`brl`, `dataHora`, `fmtCpf`…) e 48 chamadas `toLocale*('pt-BR')` — R-09.
- Decodificação do JWT copiada 3× (`apiClient.ts` ×2, `permissoes.ts`) — R-11.
- Remoção de acentos em 5 lugares (`semAcento` do shared é a versão canônica) — R-11.

## 6. Melhorias implementadas

| ID | Melhoria | Arquivos | Resultado | Validação |
| -- | -------- | -------- | --------- | --------- |
| M-01 | Lista de viagens completa (paginação por cursor + guarda de resposta obsoleta) | `hooks/useViagens.ts` | Painel passou a ver todas as viagens (no banco de teste: 22, antes 20) | typecheck; navegador: "Mostrando 22 de 22" |
| M-02 | Filtros do painel: período (data de programação, também envia `periodStart/End` aos KPIs), país de destino, situação (4 grupos), limpar, contador "Mostrando X de Y" | `pages/DashboardPage.tsx`, `lib/viagemGrupos.ts` | Malha 3D e "Viagens em andamento" respeitam os filtros | Navegador: desligar cada grupo e país UY → 19/20/16/11 de 22 e 1 de 22 (soma dos grupos = 22) |
| M-03 | Malha 3D: seleção por id, legenda, lista "Focar local" (teclado), "Reiniciar vista", Esc, aviso de itens omitidos, fallback em texto sem WebGL, `aria-label`, dispose das geometrias, cursor não fica preso | `components/3d/FleetNodeChart3D.tsx`, `lib/fleetGraph.ts`, `lib/gpu.ts` | Ver seção 8 | Navegador (sem erros de console); typecheck; build |
| M-04 | Gráfico de barras 3D reescrito (métrica, tipo de frota, top 10 ordenado; OrbitControls, tooltip por raycast, rótulos, reset, pausa fora da tela, reduced-motion, fallback, dispose completo) | `components/Dashboard3DBarChart.tsx`, `DashboardPage.tsx` | Ver seção 8 | Navegador: troca de métrica para "Nº de viagens" renderiza barras e rótulos de valor |
| M-05 | Rotas com `React.lazy` + `Suspense`; `manualChunks` só para motion | `App.tsx`, `vite.config.ts` | Chunk principal 1,17 MB → 401 KB; `index.html` só pré-carrega `motion` | `pnpm build` |
| M-06 | Segurança da API: allowList só fora de produção, `TRUST_PROXY_HOPS`, HS256 fixo, `type=refresh`, correlation-id validado, `USE_FAKE_DB` barrado em produção, `ALLOW_PUBLIC_REGISTRATION`, timeout/retry da Groq, timeout do fetch do OpenAPI, logs sem PII, guarda de módulo em motoristas | `app.ts`, `env.ts`, `auth.service.ts`, `middleware/*`, `groq.client.ts`, `adminDados.service.ts`, `motoristas.routes.ts`, `.env.example` | Ver seção 9 | typecheck; 56 testes; e2e 01/12/13/16 (13 ok) |
| M-07 | CSV sem *formula injection* | `lib/csv.ts`, `lib/csv.test.ts` | 3 testes novos | vitest |
| M-08 | Migration 0016 (ver A-04/A-05, + 2 índices de FK) | `supabase/migrations/0016_endurecimento_acesso.sql` | Pronta para aplicar | Revisão de colunas/tabelas contra 0001/0008 — **não aplicada** (ver seção 14) |
| M-09 | nginx: headers de segurança repetidos por `location`, cache imutável em `/assets`, `sw.js`/manifest sem cache, `server_tokens off` | `apps/web/nginx.conf` | Ver seção 9 | Sintaxe revisada; **não testado em container** (ver seção 14) |
| M-10 | Acessibilidade: layout (skip link, `aria-current`, `aria-expanded`, drawer como diálogo + Esc, badge como `status`), `Modal` compartilhado, `ErrorCard role=alert`, foco visível, `prefers-reduced-motion`, `aria-label` em inputs | `DashboardLayout.tsx`, `ui/Modal.tsx`, `StateViews.tsx`, `index.css`, `FrotaKpiPage.tsx`, `ProdutosListPage.tsx` | Ver seção 11 | typecheck; e2e 12/16 passam com o `Modal` novo |
| M-11 | Polling do badge da IA pausa com a aba oculta; logout limpa caches de API do service worker | `useSolicitacoesIa.ts`, `DashboardLayout.tsx` | Menos requisições; sem vazamento entre usuários | typecheck; e2e 01 (logout) |
| M-12 | Suíte estável: `vitest.config.ts` (timeouts 60 s) | `apps/api/vitest.config.ts` | 9/9 arquivos passam de forma repetível | vitest (3 execuções) |
| M-13 | Código morto removido (seção 5) | vários | −1.400 linhas | typecheck/build |

## 7. Gráficos

**Existentes**: `DonutChart` e `BarList` (SVG/HTML, só em `AcompanhamentoPage`), `CircularProgress`/`AnimatedCounter` (painel),
malha 3D e barras 3D (painel).

**Problemas encontrados**: dados truncados (D-01); contadores divergentes entre o KPI e o que aparece no 3D (o KPI contava
todas as viagens, o 3D excluía canceladas e truncava) — agora ambos usam os mesmos dados filtrados; `dt/dd` fora de `dl`
no painel (trocados por `p`); subtítulo "Arraste o olhar — rotação automática" enganoso (corrigido); `DonutChart` com
`aria-label`/texto "veículos" fixos (📋 R-07).

**Filtros implementados (todos baseados em campos reais)**:
- Período por `viagens.data_programacao` (cliente) e `periodStart/periodEnd` (API de KPIs de frota, já suportava).
- País de destino (`viagens.pais_destino`, valores reais presentes nos dados).
- Situação: grupos derivados de `FRONTEIRA_STATUS`/`MOVING_STATUS`/terminais (`grupoDoStatus`).
- Barras: métrica (km rodado, km vazio, nº de viagens, custo/km, consumo), frota própria × terceiros (`frota_propria`), top 10 ordenado.
- "Limpar filtros" e contador "Mostrando X de Y".

**Não implementado** (Receita): comparação entre períodos, exportação PNG/CSV do gráfico, zoom temporal, drill-down de barra → veículo.

## 8. Gráfico 3D

**Implementação anterior**: r3f (malha) + three puro (barras). Malha: nós = origens/destinos, arestas = rotas, caminhões
instanciados, render sob demanda com Pacer. Barras: sem interação, sem rótulos.

**Problemas**: ver D-01…D-03; além de `selected` guardando o objeto do nó (ficava órfão após recarga), cursor preso em
`pointer`, geometria do caminhão sem `dispose`, sonda WebGL de `gpu.ts` sem `loseContext`, `Dashboard3DBarChart` sem
`try/catch` do `WebGLRenderer` (derrubava a página sem WebGL).

**Melhorias aplicadas**
- *Malha*: seleção por id; legenda (origem/destino/hub/parado em fronteira); `select` "Focar local" (alternativa de teclado ao clique); "Reiniciar vista"; Esc limpa a seleção; `role="group"` + `aria-label` com totais; aviso "N locais/viagens/caminhões fora do gráfico"; fallback textual (lista de locais e viagens) quando não há WebGL ou o Canvas falha; `dispose` das geometrias; limpeza do cursor.
- *Barras*: `OrbitControls` (girar/zoom, sem pan), rotação automática apenas sem reduced-motion; tooltip por raycast (mouse/toque); rótulos de nome e valor (sprites sem fog); enquadramento proporcional ao nº de barras; geometria única compartilhada escalada por barra; recriação só quando o **conteúdo** dos dados muda (assinatura); loop pausado com aba oculta/fora da tela; dispose de geometrias, materiais, texturas e `forceContextLoss`; botão "Reiniciar vista"; `role="img"` com os valores no `aria-label`; chips textuais equivalentes abaixo.
- *Comum*: `gpu.ts` agora expõe `hasWebgl` e libera o contexto da sonda.

**Não feito**: modo de comparação entre períodos; instancing das barras (≤ 10 barras não justifica); migrar as barras para r3f (reaproveitaria Pacer/HDRI, mas reescreve o que já funciona — R-13, opcional).

**Performance** (medida pelo build): `three` (684 KB) e r3f só são baixados ao abrir o painel; nenhum deles é pré-carregado no login.

## 9. Segurança

Pontos já bons (não mexidos): todas as rotas de negócio exigem `authenticate`; `adminDados` com allowlist fechada de tabelas e colunas validadas pelo OpenAPI do PostgREST (sem injeção); trigger de proteção de campos de acesso; zod `.strict()` em perfil/usuários; rate limit 5/min em login/registro; refresh em cookie httpOnly SameSite=Strict; buckets privados com URL assinada; nenhum `dangerouslySetInnerHTML`; `.env` e `.mcp.json` fora do git e do histórico.

Correções aplicadas: A-03, A-04/05 (arquivo), A-06 (parcial), A-07, S-01…S-08 (tabela da seção 4).

**Variáveis novas** (`apps/api/.env.example`):
- `ALLOW_PUBLIC_REGISTRATION` (padrão `true`, comportamento anterior). **Recomendado `false` em produção.**
- `TRUST_PROXY_HOPS` (padrão vazio = confia em `X-Forwarded-For`). Com Traefik/Coolify à frente, defina o nº de proxies (normalmente `1`) **depois de confirmar** a topologia; valor errado faz todos os usuários compartilharem o mesmo IP no rate limit.

Pendente: A-01(c), A-02, A-06 (revogação), S-09, S-10 → Receita R-01…R-06.

## 10. Performance

| Gargalo | Medida | Ação |
| ------- | ------ | ---- |
| Chunk principal 1.165 KB | → 401 KB (−66%) | `React.lazy` por rota |
| `index.html` pré-carregava three/r3f (~1,2 MB) no login | → só `motion` | `manualChunks` reduzido |
| `Dashboard3DBarChart` recriava o WebGL a cada render | → só quando os dados mudam | assinatura por conteúdo |
| Polling de 30 s com aba oculta | → pausado | `document.hidden` |
| `GET /viagens` com 1 requisição truncada | → N páginas de 200 | cursor |
| Precache do PWA (108 entradas, 3,1 MB) | não alterado | R-14 |
| Requisições repetidas (motoristas/veículos com `limit=1000` em 4 telas cada) | não alterado | R-09 (`useApiQuery` com cache) |

## 11. UX/UI

Corrigido: filtros e feedback ("Mostrando X de Y", aviso de truncamento), estados vazios do 3D ("Nenhuma viagem … com os filtros atuais"), navegação por teclado (skip link, Esc, `select` de foco), foco visível (`.btn-*`, links do menu, `.input` com anel mais forte), `role=alert` em erros, modais com Esc/`aria-modal`/devolução de foco, `prefers-reduced-motion` global, rótulo do card "Viagens em andamento" (antes "Em trânsito agora", que incluía veículos parados no cliente).

Pendente (R-07): contraste de `text-slate-400` (≈ 2,6:1) e de `slate-500` no tema "suave"; `aria-label` nos demais inputs só-com-placeholder (`AvariasListPage`, `ArmazemMapaPage`, `FreteWorkflowView`, `ViagemDetailPage`); `ConfirmDialog` no lugar de 8 `window.confirm`; `<caption>`/`scope` em tabelas; o cenário da malha 3D usa névoa e grade claras também no tema escuro (ajustar ao tema).

## 12. Testes

Executados nesta auditoria (resultado real):

| Comando | Resultado |
| ------- | --------- |
| `pnpm typecheck` (shared, api, web) | ✅ sem erros |
| `pnpm --filter @rigabras/api test` (vitest) | ✅ 9 arquivos / 56 testes (inclui 3 novos de CSV) |
| `npx playwright test` — `01-auth-rbac`, `12-usuarios-categorias`, `13-motoristas`, `16-gerenciar-dados` | ✅ 13/13 |
| `npx playwright test` — suíte completa (16 specs) | ✅ 40/41 (a falha é resíduo de dados do banco falso, ver seção 13) |
| Verificação manual no navegador (painel): filtros, malha 3D, barras 3D | ✅ sem erros de console |

Sem runner de testes no `apps/web`: a lógica pura nova (`grupoDoStatus`, `buildFleetGraph`) está sem teste unitário — R-15.
`lint` é placeholder nos dois apps (`echo`), não há ESLint configurado — R-16.

## 13. Build

- `pnpm --filter @rigabras/api build` → ✅.
- `pnpm --filter @rigabras/web build` (`tsc --noEmit` + `vite build` + PWA) → ✅, ~30 s. Maior chunk eager: `index` 401 KB; lazy: `three` 684 KB, `ImportacaoInteligente` 448 KB, `pdf` 365 KB.
- Suíte e2e completa: resultado registrado no commit final / ao fim desta seção (ver "Resultado da suíte completa" abaixo).

**Resultado da suíte completa (16 specs)**: **40 de 41 passaram** (7,2 min). O único que falhou foi `13-motoristas` ao ser **reexecutado** sobre o mesmo servidor: o teste usa um CPF fixo e o banco falso em memória já continha o motorista criado na execução anterior ("Já existe um motorista com o CPF…"); na primeira execução (banco limpo) ele passou (13/13 no lote 01/12/13/16). Não é regressão do código; para repetir, reinicie a API com `USE_FAKE_DB=true`.

## 14. Alterações pendentes (o que realmente não foi concluído)

1. **Migration 0016 não foi aplicada** ao banco (as migrations são manuais). Aplique no SQL Editor do Supabase. Nota: a 0013 também constava como pendente na memória do projeto — confira antes.
2. **Ações suas** (não posso executar): rotacionar tokens (A-02), desligar signup no Supabase Auth e setar `ALLOW_PUBLIC_REGISTRATION=false` (A-01), definir `TRUST_PROXY_HOPS` no Coolify.
3. `nginx.conf` novo **não foi exercitado num container** (só revisado). No primeiro deploy, confirme que o site carrega e que `/assets/*` e `/sw.js` respondem com o `Cache-Control` esperado.
4. Itens R-01…R-16 da Receita.
5. Trabalho paralelo de outra sessão no mesmo repositório (importação/campos personalizados: `apps/api/src/modules/importacao/inteligente/*`, `camposPersonalizados`, migration `0015`, etc.) **não foi alterado nem commitado por esta auditoria**.

## 15. Próximas melhorias

Comparação entre períodos nos gráficos; exportar gráfico (PNG/CSV); drill-down de barra → veículo; tema escuro coerente na cena 3D; busca por placa/CRT que foca o nó na malha; react-query ou `useApiQuery` com cache; LazyMotion para reduzir ~100 KB do framer-motion; separar `SolicitacoesIaPage` (1.037 linhas), `UsuariosPage`, `AcompanhamentoPage` em componentes.

---

# 16. RECEITA DE EVOLUÇÃO DO PROJETO

Cada bloco é autossuficiente. Execute na ordem de prioridade. Comandos de validação padrão:
`pnpm --filter @rigabras/shared build && pnpm typecheck && pnpm --filter @rigabras/api test && pnpm --filter @rigabras/web build`
(e, para fluxos de tela, `npx playwright test tests/e2e/<spec>` — **só com a API em `USE_FAKE_DB=true`**; o `playwright.config.ts` reaproveita servidores já abertos nas portas 3333/5173).

## R-01 — Fechar leitura indevida do papel VISITANTE no banco (A-01c)

```text
MELHORIA: Retirar VISITANTE das policies de SELECT sensíveis e do Storage
OBJETIVO: Quem tem apenas a anon key não consegue ler PII/financeiro via PostgREST/Storage
MOTIVO: A API usa service-role; o front não precisa de acesso direto às tabelas de negócio. Hoje qualquer conta
        VISITANTE (autocadastro) lê motoristas (CPF/RG), fretes, pagamentos, apólices, portaria.
PRIORIDADE: P0
ARQUIVOS ENVOLVIDOS: supabase/migrations/0017_*.sql (novo); 0002_rls_policies.sql, 0004_modulo3_financeiro_frete.sql,
  0008_modulo8_portaria.sql, 0014_viagens_fluxo_cargas.sql (somente leitura, para localizar os nomes das policies)
DEPENDÊNCIAS: Migration 0016 aplicada; ambiente de teste com Postgres real (Supabase local/branch) — o banco falso não testa RLS
IMPLEMENTAÇÃO:
[ ] Listar as policies: `select tablename, policyname, cmd, qual from pg_policies where schemaname in ('public','storage');`
[ ] Para cada policy de SELECT que inclui 'VISITANTE' em motoristas, motorista_documentos, fretes, pagamentos_frete,
    frete_lancamentos, apolices_seguro, portaria_*, e em storage.objects (buckets portaria-documentos e de motoristas):
    `drop policy ...; create policy ... using (current_user_role() in ('SUPERADMIN','ADMIN','OPERADOR'))`
[ ] (Opcional, mais forte) `revoke all on <tabelas> from anon, authenticated;` — a API (service-role) não é afetada;
    confirmar antes que nenhum trecho do web usa `supabase.from(...)` direto (`grep -rn "supabase\.from\|\.storage" apps/web/src`)
[ ] Conferir no Supabase Auth → Providers → Email: desativar "Allow new users to sign up"
[ ] Setar ALLOW_PUBLIC_REGISTRATION=false no Coolify
VALIDAÇÃO: Com um JWT de VISITANTE recém-criado, `GET {SUPABASE_URL}/rest/v1/motoristas` (anon key) deve retornar [] ou 401/403;
  os e2e 01/12/13 continuam passando (usam a API, não o PostgREST).
CRITÉRIO DE CONCLUSÃO: Nenhuma policy de SELECT das tabelas sensíveis lista VISITANTE; teste manual acima nega acesso.
```

## R-02 — Revogação de refresh tokens (A-06)

```text
MELHORIA: Guardar e revogar `jti` dos refresh tokens (rotação com detecção de reuso)
OBJETIVO: Logout, troca de senha e desativação invalidam sessões; token roubado e reutilizado é detectado
MOTIVO: Hoje o `jti` é gerado e ignorado; logout só limpa o cookie no navegador; refresh roubado vale 7 dias
PRIORIDADE: P1
ARQUIVOS ENVOLVIDOS: apps/api/src/modules/auth/{auth.service.ts,auth.controller.ts}, apps/api/src/modules/usuarios/usuarios.service.ts,
  supabase/migrations/0018_refresh_tokens.sql (novo), apps/api/src/config/fakeSupabase*.ts (tabela nova no banco falso)
DEPENDÊNCIAS: nenhuma (Redis é opcional; usar tabela Postgres)
IMPLEMENTAÇÃO:
[ ] Criar tabela `refresh_tokens(jti uuid primary key, user_id uuid references profiles(id) on delete cascade, expires_at timestamptz not null, revoked_at timestamptz, replaced_by uuid)` + RLS habilitada sem policies (só service-role) + índice em user_id
[ ] `issueSession`: inserir o jti emitido
[ ] `refresh`: carregar o jti do token; se não existe/expirado/revogado → 401 e, se já estava revogado (reuso), revogar todos os tokens do usuário; senão marcar o atual como revogado (`replaced_by` = novo) e emitir o novo
[ ] `logout`: ler o cookie, revogar o jti; controller deve chamar o service
[ ] `usuarios.service`: ao desativar usuário ou redefinir senha → `update refresh_tokens set revoked_at = now() where user_id = ... and revoked_at is null`
[ ] Estender `fakeSupabase` para a tabela e adicionar teste em `usuarios.integration.test.ts` (logout invalida refresh)
VALIDAÇÃO: vitest (novo teste); `npx playwright test tests/e2e/01-auth-rbac.spec.ts`
CRITÉRIO DE CONCLUSÃO: refresh após logout → 401; reuso de refresh já rotacionado → 401 e demais sessões revogadas.
```

## R-03 — Rate limit dedicado e upload seguro (S-09)

```text
MELHORIA: Limitar endpoints caros e validar uploads
OBJETIVO: Evitar custo/DoS via IA e upload, e arquivos disfarçados
MOTIVO: /rigabras-ai/perguntar, /viagens/:id/analise-risco, /motoristas/ocr, /importacoes/ia/analisar, /importacoes e /validar
  só têm o limite global (100/min). Upload de motorista confia no `mime` do cliente e recebe até 45 MB em base64.
PRIORIDADE: P2
ARQUIVOS ENVOLVIDOS: apps/api/src/modules/{chatbot,viagens,motoristas,importacao}/*.routes.ts, motoristas.documentos.ts, packages/shared/src/entities/motorista.ts
DEPENDÊNCIAS: nenhuma
IMPLEMENTAÇÃO:
[ ] Nas rotas acima, adicionar `config: { rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: (req) => req.user?.sub ?? req.ip } }` (padrão já usado em /importacoes/inteligente)
[ ] `motoristas.documentos.ts`: validar o base64 com regex `^[A-Za-z0-9+/]+={0,2}$`, decodificar e checar magic bytes (JPEG FF D8 FF, PNG 89 50 4E 47, WEBP "RIFF….WEBP", PDF "%PDF"); usar o tipo detectado como `contentType`
[ ] Buckets: definir `file_size_limit` e `allowed_mime_types` (nova migration, `update storage.buckets set ... where id in (...)`)
[ ] Teste unitário dos magic bytes (arquivo novo `motoristas.documentos.test.ts`)
VALIDAÇÃO: vitest; `npx playwright test tests/e2e/13-motoristas.spec.ts`
CRITÉRIO DE CONCLUSÃO: 11ª chamada em 1 min retorna 429; arquivo com extensão/mime falsos é recusado (422).
```

## R-04 — Totais do chatbot truncados em 1000 linhas (S-09)

```text
MELHORIA: Usar contagem/soma no banco em vez de ler linhas inteiras
OBJETIVO: Números corretos nas respostas do RIGABRAS AI
MOTIVO: PostgREST corta em `max-rows` (1000) silenciosamente; `chatbot.repository.ts` (linhas ~25-77) conta/soma no código
PRIORIDADE: P2
ARQUIVOS ENVOLVIDOS: apps/api/src/modules/chatbot/chatbot.repository.ts, apps/api/src/lib/fetchAllPages.ts
DEPENDÊNCIAS: nenhuma
IMPLEMENTAÇÃO:
[ ] Trocar leituras de contagem por `select('id', { count: 'exact', head: true })`
[ ] Para somas, usar `fetchAllPages` (já existe) ou uma função SQL (`rpc`) agregadora
VALIDAÇÃO: teste com fake DB contendo > 1000 linhas (o banco falso não trunca: simular via `fetchAllPages` mockado) ou validação manual no Supabase
CRITÉRIO DE CONCLUSÃO: totais batem com `select count(*)` direto no banco.
```

## R-05 — CSP e token fora do localStorage (S-10)

```text
MELHORIA: Content-Security-Policy no nginx e access token só em memória
OBJETIVO: Defesa em profundidade contra XSS
MOTIVO: Sem CSP e com o token em localStorage, qualquer XSS rouba a sessão
PRIORIDADE: P2
ARQUIVOS ENVOLVIDOS: apps/web/nginx.conf, apps/web/index.html, apps/web/src/lib/apiClient.ts, pages/LoginPage.tsx, RegisterPage.tsx, hooks/useJornadaHistorico.ts, lib/permissoes.ts
DEPENDÊNCIAS: Domínio de produção definido (SameSite=Strict do refresh exige web e API no mesmo site)
IMPLEMENTAÇÃO:
[ ] Levantar as origens usadas: API (VITE_API_BASE_URL), Supabase (VITE_SUPABASE_URL), Google Fonts (index.html)
[ ] Adicionar primeiro `Content-Security-Policy-Report-Only` no bloco `location /` do nginx: default-src 'self'; script-src 'self' (+ hash do script inline do index.html, ou removê-lo); style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: <supabase>; connect-src 'self' <api> <supabase>; worker-src 'self' blob:
[ ] Observar violações por alguns dias; só então trocar para `Content-Security-Policy`
[ ] Token: manter o access token em variável de módulo (`apiClient.ts`), obter na carga via `/auth/refresh` (cookie httpOnly); remover `localStorage.getItem/setItem('rigabras_access_token')` e ajustar o helper dos e2e (`tests/e2e/helpers.ts` lê a sessão pela UI)
VALIDAÇÃO: Navegar todas as telas com o console aberto (sem violações); `npx playwright test` completo
CRITÉRIO DE CONCLUSÃO: Nenhuma violação no relatório por 3 dias; `localStorage` sem token.
```

## R-06 — Validação de caminho e erros 5xx (S-09)

```text
MELHORIA: Validar `storage_path` da portaria e não vazar mensagens internas em 5xx
OBJETIVO: Fechar path traversal teórico e informação interna
MOTIVO: portaria.service.ts:~215 usa `startsWith(`${entradaId}/`)` sem validar UUID; helpers `run` de usuarios/categorias/perfil
  devolvem `error.message` do PostgREST como `detail` em 500
PRIORIDADE: P2
ARQUIVOS ENVOLVIDOS: apps/api/src/modules/portaria/portaria.service.ts, modules/usuarios/usuarios.controller.ts, categorias/categorias.service.ts, perfil/perfil.service.ts, auth/auth.controller.ts
DEPENDÊNCIAS: nenhuma
IMPLEMENTAÇÃO:
[ ] Validar `storage_path` com regex `^<uuid>/[0-9a-f-]{36}\.[a-z0-9]{1,10}$` (rejeita `..`)
[ ] Nos handlers 5xx: logar o erro real (`request.log.error`) e responder `detail` genérico ("Erro interno")
VALIDAÇÃO: vitest + `npx playwright test tests/e2e/12-usuarios-categorias.spec.ts`
CRITÉRIO DE CONCLUSÃO: `../` recusado (422); nenhum 500 traz texto de constraint/SQL.
```

## R-07 — Acessibilidade restante

```text
MELHORIA: aria-label em inputs, contraste, ConfirmDialog, tabelas, DonutChart
OBJETIVO: WCAG 2.1 AA nas telas principais
MOTIVO: Só placeholder como rótulo em várias telas; slate-400 ≈ 2,6:1; window.confirm em 8 pontos; DonutChart com texto fixo
PRIORIDADE: P2
ARQUIVOS ENVOLVIDOS: pages/{AvariasListPage,ArmazemMapaPage,ViagemDetailPage}.tsx, components/FreteWorkflowView.tsx, components/charts/Charts.tsx,
  components/ui/Modal.tsx (base do ConfirmDialog), pages/{AcompanhamentoPage,UsuariosPage,MotoristaFormPage,ManutencaoDetailPage,GerenciarDadosPage}.tsx, themes.cjs, tailwind.config.js
DEPENDÊNCIAS: nenhuma
IMPLEMENTAÇÃO:
[ ] Rodar um script que liste `<input|select|textarea>` sem `aria-label`/`id+label`/label pai e corrigir (o padrão `aria-label={placeholder}` já foi aplicado em FrotaKpiPage e ProdutosListPage)
[ ] Trocar `text-slate-400` por `text-slate-500` em textos informativos (17 ocorrências); medir slate-500 sobre `canvas` no tema "suave" (themes.cjs) e escurecer se < 4,5:1
[ ] Criar `components/ui/ConfirmDialog.tsx` (sobre `Modal`) e substituir os 8 `window.confirm`
[ ] `DonutChart`: receber `ariaLabel` e `unidade` por prop (hoje "Distribuição por status"/"veículos" fixos)
[ ] Tabelas: `<caption className="sr-only">` e `scope="col"` nos `<th>`
[ ] Cena 3D no tema escuro: ler as cores de fundo/fog de variáveis CSS do tema (`getComputedStyle`) em vez de `#f8fafc` fixo
VALIDAÇÃO: Auditoria axe/Lighthouse nas páginas /dashboard, /viagens, /motoristas, /usuarios; e2e 12/13/16
CRITÉRIO DE CONCLUSÃO: 0 violações "serious/critical" no axe nas páginas listadas.
```

## R-08 — Hook `useApiQuery` e migração dos hooks de lista

```text
MELHORIA: Extrair o esqueleto repetido dos hooks de leitura
OBJETIVO: Menos código, cancelamento, guarda de resposta obsoleta e cache curto compartilhado
MOTIVO: ~28 hooks com o mesmo useState/useCallback/useEffect e 47 cópias de `err instanceof ApiError ? … : 'Erro inesperado'`;
  useMotoristasList/useVeiculosList (limit=1000) são chamados em 4 telas cada
PRIORIDADE: P2
ARQUIVOS ENVOLVIDOS: apps/web/src/lib/apiErro.ts (novo), apps/web/src/hooks/useApiQuery.ts (novo), hooks/{useMotoristas,useVeiculos,useDepositantes,useFrotaKpis,useViagens}.ts
DEPENDÊNCIAS: R-15 (teste do hook) recomendado antes
IMPLEMENTAÇÃO:
[ ] `lib/apiErro.ts`: `mensagemDeErro(err: unknown): string` (mesma regra dos hooks)
[ ] `useApiQuery<T>(path: string | null, opts?: { ttlMs?: number })` → `{ state, data, error, reload }`: `AbortController` por requisição, contador de sequência (padrão já usado em `useViagensList`), cache em `Map<path, {em, data}>` com TTL curto, invalidação exposta (`invalidateApiCache(prefix)`) chamada após POST/PATCH/DELETE
[ ] Migrar primeiro `useMotoristasList`, `useVeiculosList`, `useDepositantesList` mantendo a assinatura pública (`{state, xxx, error, reload}`)
[ ] Migrar os demais gradualmente (um PR por grupo)
VALIDAÇÃO: typecheck; e2e 02, 13, 15 (criação reflete na lista → cache invalidado)
CRITÉRIO DE CONCLUSÃO: Uma navegação Viagem-form → Manutenção-form dispara 1 requisição `/motoristas` e 1 `/veiculos` (aba Network).
```

## R-09 — Formatadores centralizados

```text
MELHORIA: `lib/formatters.ts` único (BRL, número, data, data/hora, CPF) tolerante a nulo
OBJETIVO: Formatação consistente e sem "Invalid Date"/fuso trocado
MOTIVO: 48 `toLocale*('pt-BR')` em 29 arquivos; datas `new Date(`${d}T00:00:00`)` com fuso; `new Date(x ?? '')` → "Invalid Date"
PRIORIDADE: P2
ARQUIVOS ENVOLVIDOS: apps/web/src/lib/formatters.ts (novo, absorve lib/dateOnly.ts), pages/{ViagemDetailPage,SolicitacoesIaPage,GerenciarDadosPage,MotoristaFormPage,RecebimentoDetailPage,RecebimentosListPage,AcompanhamentoPage,PortariaEntradasListPage,PortariaEntradaDetailPage,FretesListPage,ManutencoesListPage,FrotaKpiPage,FronteiraKpiPage}.tsx, components/FreteWorkflowView.tsx
DEPENDÊNCIAS: coordenar com quem edita ViagemDetailPage/MotoristaFormPage (estavam em alteração paralela)
IMPLEMENTAÇÃO:
[ ] Criar `brl(v)`, `num(v, dec)`, `dataCurta(v)`, `dataHora(v)`, `cpf(v)` retornando '—' para null/undefined/inválido; reexportar `formatDateOnly`/`todayLocalIso`
[ ] Substituir os formatadores locais listados e as chamadas `toLocale*` (busca por `toLocale` e `Intl.`)
[ ] Teste unitário dos formatadores (ver R-15)
VALIDAÇÃO: typecheck; percorrer as telas alteradas
CRITÉRIO DE CONCLUSÃO: `grep -rn "toLocale" apps/web/src | grep -v formatters.ts` sem resultados (exceto casos justificados).
```

## R-10 — Componentes compartilhados (`Info`, `Kpi`, `Field`) e páginas gigantes

```text
MELHORIA: Extrair componentes repetidos e quebrar páginas > 500 linhas
OBJETIVO: Consistência visual e manutenção
MOTIVO: `Info` em 5 arquivos, `Kpi` em 5, `Field` em 4; SolicitacoesIaPage 1.037 linhas, UsuariosPage ~830, AcompanhamentoPage 827
PRIORIDADE: P3
ARQUIVOS ENVOLVIDOS: components/ui/{Info,Kpi,Field}.tsx (novos) e as páginas que hoje os definem (FreteWorkflowView, FronteiraKpiPage, JornadaHistoricoPage, ManutencaoDetailPage, ViagemDetailPage; AcompanhamentoPage, ArmazemMapaPage, FronteiraTravessiaPage, FrotaKpiPage, WmsKpiPage; FreteContratadoForm, DepositanteFormPage, ManutencaoFormPage, ViagemFormPage)
DEPENDÊNCIAS: nenhuma (Modal já extraído). Não refatorar `consolidacao.ts` enquanto houver trabalho paralelo na importação
IMPLEMENTAÇÃO:
[ ] Extrair cada componente com a assinatura atual (verifique que as 5 cópias são equivalentes antes; se divergirem, unifique com props)
[ ] Quebrar SolicitacoesIaPage (diff, filtros, painéis), UsuariosPage (aba de categorias, editor de módulos), AcompanhamentoPage (tabela de veículos, bloco de importação) em arquivos próprios sem mudar comportamento
VALIDAÇÃO: typecheck; e2e 10, 12; comparação visual antes/depois
CRITÉRIO DE CONCLUSÃO: nenhuma duplicata restante dos três componentes; páginas alvo < 500 linhas.
```

## R-11 — Higiene do backend e do shared

```text
MELHORIA: Mover `isSchemaAusente`, unificar tradutores de erro do Postgres, JWT decode único, `semAcento` único
OBJETIVO: Coesão
MOTIVO: `lib/permissoes.ts` abriga `isSchemaAusente`/`MIGRATION_0013_PENDENTE` (11 importadores) sem relação com permissões;
  `lib/pgErrors.ts` e `lib/pgConstraintErrors.ts` tratam 23505/23503/23514; decode do JWT copiado em apiClient.ts (2×) e permissoes.ts;
  remoção de acentos em 5 lugares
PRIORIDADE: P3
ARQUIVOS ENVOLVIDOS: apps/api/src/lib/{permissoes,schemaPendente,pgErrors,pgConstraintErrors,fetchAllPages}.ts, apps/web/src/lib/{apiClient,permissoes}.ts, packages/shared/src/planilhaScan.ts
DEPENDÊNCIAS: nenhuma
IMPLEMENTAÇÃO:
[ ] Mover as duas exportações para `lib/schemaPendente.ts`; em `permissoes.ts` deixar re-export temporário; atualizar os 11 imports (`grep -rn "isSchemaAusente" apps/api/src`) e remover o re-export
[ ] Fundir `pgConstraintErrors.fromPgError` dentro de `pgErrors.ts` mantendo o dicionário de constraints; ajustar repositories
[ ] `decodeJwtPayload(token)` em `apps/web/src/lib/jwt.ts` e usar nos 3 pontos
[ ] Mover `periodoInicioTs/periodoFimTs` de `fetchAllPages.ts` para `lib/periodo.ts`
VALIDAÇÃO: typecheck; `pnpm --filter @rigabras/api test`; e2e 01, 12
CRITÉRIO DE CONCLUSÃO: sem re-exports temporários; testes verdes.
```

## R-12 — Remover o que sobrou do fluxo antigo de importação e hooks órfãos

```text
MELHORIA: Apagar endpoints/hooks sem consumidor
OBJETIVO: Menos superfície de ataque e manutenção
MOTIVO: Ver seção 5
PRIORIDADE: P3
ARQUIVOS ENVOLVIDOS: apps/api/src/modules/importacao/{importacao.routes.ts,importacao.ia.ts,importacao.controller.ts,importacao.service.ts}, apps/web/src/hooks/{useInventarios,useDepositantes,useEnderecosArmazem,useFretes,useImportacao}.ts, components/StatusBadge.tsx
DEPENDÊNCIAS: confirmar que `tests/e2e` (11, 14) e `scripts/*` não chamam `/importacoes/ia/analisar` nem `/importacoes/lotes/*`
IMPLEMENTAÇÃO:
[ ] `grep -rn "importacoes/ia\|importacoes/lotes" apps tests scripts` — se só a definição aparecer, remover rotas/controller/service/`importacao.ia.ts`
[ ] Decidir sobre `useInventarios.ts`: apagar, ou criar a tela de inventário (a API existe) — não deixar ambos
[ ] Remover os hooks e badges listados na seção 5 que continuarem sem uso após `grep -rnw <nome> apps tests`
VALIDAÇÃO: typecheck + vitest + e2e 11, 14
CRITÉRIO DE CONCLUSÃO: `tsc` sem erros e nenhum export não referenciado na lista da seção 5.
```

## R-13 — (Opcional) Barras 3D em r3f

```text
MELHORIA: Migrar Dashboard3DBarChart para @react-three/fiber
OBJETIVO: Um único stack 3D (reaproveita Pacer, HDRIEnvironment, CanvasBoundary, gpu.ts)
MOTIVO: Dois renderizadores = duas estratégias de resize/dispose/luz
PRIORIDADE: P3
ARQUIVOS ENVOLVIDOS: components/Dashboard3DBarChart.tsx, components/3d/FleetNodeChart3D.tsx (extrair Pacer/CanvasBoundary para components/3d/shared.tsx)
DEPENDÊNCIAS: nenhuma; só vale se for mexer muito nesse gráfico
IMPLEMENTAÇÃO:
[ ] Extrair `Pacer`/`CanvasBoundary`; recriar barras com `<mesh>` compartilhando geometria; tooltip via `Html`; rótulos via `Text` do drei
VALIDAÇÃO: paridade visual/funcional no navegador (métrica, top 10, tooltip, reset, fallback sem WebGL)
CRITÉRIO DE CONCLUSÃO: sem `new THREE.WebGLRenderer` no projeto.
```

## R-14 — Precache do PWA e LazyMotion

```text
MELHORIA: Não pré-cachear chunks pesados e reduzir o framer-motion
OBJETIVO: Instalação da PWA mais leve
MOTIVO: precache de 108 entradas (3,1 MB) inclui three (684 KB) e o worker do pdfjs (1,3 MB); framer-motion eager (~146 KB)
PRIORIDADE: P3
ARQUIVOS ENVOLVIDOS: apps/web/vite.config.ts, componentes que importam `motion` (DashboardLayout, GlassCard, Telemetry, Charts)
DEPENDÊNCIAS: nenhuma
IMPLEMENTAÇÃO:
[ ] `workbox.globIgnores: ['**/pdf.worker*', '**/gpu-*.js', '**/pdf-*.js']` e `runtimeCaching` CacheFirst para esses arquivos
[ ] Trocar `motion.*` por `m.*` com `<LazyMotion features={domAnimation}>` no `main.tsx`
VALIDAÇÃO: `pnpm build` (tamanho do precache/entry); testar offline após instalar a PWA
CRITÉRIO DE CONCLUSÃO: precache < 1,5 MB; animações iguais.
```

## R-15 — Testes do front (lógica pura)

```text
MELHORIA: Adicionar vitest ao apps/web e cobrir a lógica de filtros/grafo
OBJETIVO: Proteger `grupoDoStatus`, `buildFleetGraph`, formatadores e `useApiQuery`
MOTIVO: Regras novas de filtro e dedup (origem = destino, tetos) só foram verificadas manualmente
PRIORIDADE: P2
ARQUIVOS ENVOLVIDOS: apps/web/package.json (devDependency vitest — mesma versão do api, ^2.1.2), apps/web/vitest.config.ts, apps/web/src/lib/{viagemGrupos,fleetGraph}.test.ts
DEPENDÊNCIAS: nenhuma (`pnpm install` para atualizar o lockfile)
IMPLEMENTAÇÃO:
[ ] `pnpm --filter @rigabras/web add -D vitest@^2.1.2`; script `"test": "vitest run"`
[ ] Casos: `grupoDoStatus('CANCELADA') === null`; FRONTEIRA tem precedência sobre EM_ROTA; `buildFleetGraph` com viagem origem = destino conta 1×; >40 locais preenche `omitted.nodes`; viagens fora dos nós mantidos não geram aresta
VALIDAÇÃO: `pnpm test` na raiz
CRITÉRIO DE CONCLUSÃO: testes verdes e rodando no `pnpm test`.
```

## R-16 — Lint

```text
MELHORIA: Configurar ESLint (hoje `lint` é `echo`)
OBJETIVO: Pegar imports mortos, hooks com deps erradas, `any`
MOTIVO: Só o `tsc` com noUnused* protege; não há regra de hooks
PRIORIDADE: P3
ARQUIVOS ENVOLVIDOS: eslint.config.js (raiz), package.json dos dois apps
DEPENDÊNCIAS: decidir regras com o time (justificar cada dependência nova)
IMPLEMENTAÇÃO:
[ ] `typescript-eslint` + `eslint-plugin-react-hooks` (web); regra `no-console` exceto `config/env.ts`
[ ] Corrigir apenas erros; avisos em arquivo à parte
VALIDAÇÃO: `pnpm lint`
CRITÉRIO DE CONCLUSÃO: `pnpm lint` real e verde no CI.
```

---

## Proteção contra regressão (conferência final)

- Rotas e contratos da API preservados (nenhuma rota removida do front em uso; removidas só páginas sem rota). Novidades de comportamento: `motoristas` passa a exigir módulo (motoristas **ou** viagens; leitura também para jornada/fronteira/portaria/painel/fretes/wms); rate limit sem isenção em produção; registro pode ser desligado por env (padrão ligado).
- Banco preservado: nenhuma migration foi aplicada; 0016 é idempotente e só endurece.
- Autenticação preservada (login/refresh/logout verificados nos e2e 01/12).
- Gráficos e filtros verificados no navegador; responsividade: filtros em `flex-wrap` e altura fixa 460/360 px mantida. **Não** foi testado em celular/tablet reais nem com o `resize_window` mobile; ponto de atenção: o `OrbitControls` captura o gesto de um dedo dentro do canvas (pode "prender" o scroll vertical sobre o gráfico) — avaliar ativar a rotação só com dois dedos ou botão "ativar interação" (incluir em R-07).
