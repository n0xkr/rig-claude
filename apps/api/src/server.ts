import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

async function main(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info({ port: env.PORT, host: env.HOST, env: env.NODE_ENV }, "Rigabras API iniciada");
  } catch (error) {
    logger.fatal({ err: error }, "Falha ao iniciar o servidor");
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // Graceful shutdown (critério #7): intercepta SIGINT/SIGTERM, finaliza
  // conexões ativas antes de encerrar o processo.
  // ------------------------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Encerrando servidor graciosamente...");
    try {
      await app.close();
      logger.info("Servidor encerrado com sucesso");
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, "Erro ao encerrar servidor");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
