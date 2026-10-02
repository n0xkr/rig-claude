# Plano de execução (resumo de status)

| Fase | Status | Observação |
|---|---|---|
| 0 Baseline | CONCLUÍDA | BASELINE.md |
| 1 Segredos | PARCIAL | `.gitignore` reforçado, gitlink/planilha/pptx/pdf desrastreados. **Rotação dos tokens do `.mcp.json` é manual (dono).** |
| 2 Config produção | CONCLUÍDA | placeholders recusados, segredos distintos ≥32, trustProxy explícito, iss/aud nos JWT |
| 3 Auth | CONCLUÍDA* | refresh rotativo com jti/família + logout revoga + rate limit (*requer migration 0017) |
| 4 RBAC | PARCIAL | RLS: VISITANTE sem financeiro/documentos de motorista (0017). Matriz da API: pendente |
| 5/6 WMS atômico | PARCIAL | RPC `registrar_movimentacao_estoque` (lock + saldo ≥ 0). Expedição/recebimento/inventário ainda sequenciais |
| 7 Máquinas de estado | PARCIAL | frete: update condicional + trigger no banco |
| 8 Financeiro | CONCLUÍDA* | RPC `registrar_pagamento_frete` (lock, estado, limite de saldo) |
| 9 Idempotência | CONCLUÍDA* | middleware `Idempotency-Key` + tabela `idempotency_keys` |
| 10 Offline | CONCLUÍDA | chave de idempotência, fila por usuário, FAILED/CONFLICT |
| 11–13, 15, 17, 19–22 | PENDENTE | |
| 14 ERP | CONCLUÍDA | paginação, lotes, fuso -03:00, sem N+1 |
| 18 CI | PARCIAL | `.github/workflows/ci.yml` (typecheck, testes, build, secret scan) |

Status do projeto: **NOT READY** — falta Postgres real/RLS/concorrência/E2E.
