# Changelog de execução
- Config: validação de produção, JWT iss/aud, trustProxy, registro público desligado por padrão.
- Auth: refresh token rotativo, revogação no logout, rate limit.
- Banco 0017: RPCs transacionais (estoque, pagamento de frete), trigger de transição de frete, RLS sem VISITANTE em financeiro, idempotency_keys, refresh_tokens.
- API: middleware de idempotência, ERP paginado, chatbot com rate limit.
- Web: fila offline com Idempotency-Key, escopo por usuário, estados FAILED/CONFLICT; CSP/HSTS no nginx.
