import type { FastifyInstance } from "fastify";
import { authRoutes } from "../modules/auth/auth.routes.js";
import { viagensRoutes } from "../modules/viagens/viagens.routes.js";
import { veiculosRoutes } from "../modules/veiculos/veiculos.routes.js";
import { motoristasRoutes } from "../modules/motoristas/motoristas.routes.js";
import { eventosRiscoDirectRoutes, eventosRiscoNestedRoutes } from "../modules/eventosRisco/eventosRisco.routes.js";
import { apolicesRoutes } from "../modules/apolices/apolices.routes.js";
import { groqRoutes } from "../modules/groq/groq.routes.js";

const API_PREFIX = "/api/v1";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes, { prefix: `${API_PREFIX}/auth` });
  await app.register(viagensRoutes, { prefix: `${API_PREFIX}/viagens` });
  await app.register(eventosRiscoNestedRoutes, { prefix: `${API_PREFIX}/viagens` });
  await app.register(groqRoutes, { prefix: `${API_PREFIX}/viagens` });
  await app.register(veiculosRoutes, { prefix: `${API_PREFIX}/veiculos` });
  await app.register(motoristasRoutes, { prefix: `${API_PREFIX}/motoristas` });
  await app.register(eventosRiscoDirectRoutes, { prefix: `${API_PREFIX}/eventos-risco` });
  await app.register(apolicesRoutes, { prefix: `${API_PREFIX}/apolices-seguro` });
}
