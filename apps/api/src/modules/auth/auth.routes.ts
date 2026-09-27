import type { FastifyInstance } from "fastify";
import { AuthController } from "./auth.controller.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, AuthController.login);
  app.post("/refresh", AuthController.refresh);
  app.post("/logout", AuthController.logout);
}
