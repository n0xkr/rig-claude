import type { FastifyInstance } from "fastify";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { EventosRiscoController } from "./eventosRisco.controller.js";

/** Rotas aninhadas em /viagens/:viagemId/eventos-risco */
export async function eventosRiscoNestedRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);
  app.get(
    "/:viagemId/eventos-risco",
    { preHandler: requireRole("SUPERADMIN", "ADMIN", "OPERADOR", "VISITANTE") },
    EventosRiscoController.listByViagem,
  );
  app.post(
    "/:viagemId/eventos-risco",
    { preHandler: requireRole("SUPERADMIN", "ADMIN", "OPERADOR") },
    EventosRiscoController.create,
  );
}

/** Rotas diretas em /eventos-risco/:id para update/delete/get avulso. */
export async function eventosRiscoDirectRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);
  app.get("/:id", { preHandler: requireRole("SUPERADMIN", "ADMIN", "OPERADOR", "VISITANTE") }, EventosRiscoController.getById);
  app.patch("/:id", { preHandler: requireRole("SUPERADMIN", "ADMIN", "OPERADOR") }, EventosRiscoController.update);
  app.delete("/:id", { preHandler: requireRole("SUPERADMIN", "ADMIN") }, EventosRiscoController.remove);
}
