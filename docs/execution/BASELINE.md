# Baseline — 2026-10-02

- Branch: master · commit de partida: `430ec60`
- `pnpm install`: ok · typecheck API/web: ok · vitest API: 9 arquivos / 56 testes ok
- Migrations no repo: 0001–0016 (estado do banco vivo não verificável pelo repo; ordem obrigatória 0013 → 0015 → 0016 → 0017)
- Variáveis obrigatórias (API): SUPABASE_URL/ANON/SERVICE_ROLE, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, COOKIE_SECRET, WEB_ORIGIN, TRUST_PROXY_HOPS (produção)
- E2E (Playwright) e banco real: não executados nesta fase.
