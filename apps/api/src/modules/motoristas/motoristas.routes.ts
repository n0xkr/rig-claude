import type { FastifyInstance } from "fastify";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { MotoristasController } from "./motoristas.controller.js";

export async function motoristasRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);
  app.get("/", { preHandler: requireRole("SUPERADMIN", "ADMIN", "OPERADOR", "VISITANTE") }, MotoristasController.list);
  app.get("/:id", { preHandler: requireRole("SUPERADMIN", "ADMIN", "OPERADOR", "VISITANTE") }, MotoristasController.getById);
  app.post("/", { preHandler: requireRole("SUPERADMIN", "ADMIN", "OPERADOR") }, MotoristasController.create);
  app.patch("/:id", { preHandler: requireRole("SUPERADMIN", "ADMIN", "OPERADOR") }, MotoristasController.update);
  app.delete("/:id", { preHandler: requireRole("SUPERADMIN", "ADMIN") }, MotoristasController.remove);
}
