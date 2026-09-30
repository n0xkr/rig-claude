import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // O teste de integração sobe o app Fastify inteiro (import de todos os módulos); com os
    // demais arquivos rodando em paralelo o hook `beforeAll` passava de 10 s em máquinas lentas.
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
