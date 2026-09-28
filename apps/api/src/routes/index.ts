import type { FastifyInstance } from 'fastify';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { viagensRoutes } from '../modules/viagens/viagens.routes.js';
import { veiculosRoutes } from '../modules/veiculos/veiculos.routes.js';
import { motoristasRoutes } from '../modules/motoristas/motoristas.routes.js';
import {
  eventosRiscoDirectRoutes,
  eventosRiscoNestedRoutes,
} from '../modules/eventosRisco/eventosRisco.routes.js';
import { apolicesRoutes } from '../modules/apolices/apolices.routes.js';
import { groqRoutes } from '../modules/groq/groq.routes.js';
import {
  fronteiraDirectRoutes,
  fronteiraNestedRoutes,
} from '../modules/fronteira/fronteira.routes.js';
import { validacaoPreEmbarqueRoutes } from '../modules/validacaoPreEmbarque/validacaoPreEmbarque.routes.js';
import {
  documentosEmbarqueDirectRoutes,
  documentosEmbarqueNestedRoutes,
} from '../modules/documentosEmbarque/documentosEmbarque.routes.js';
import { fretesDirectRoutes, fretesNestedRoutes } from '../modules/fretes/fretes.routes.js';
import { frotaRoutes } from '../modules/frota/frota.routes.js';
import { jornadaRoutes } from '../modules/jornada/jornada.routes.js';
import { wmsRoutes } from '../modules/wms/wms.routes.js';
import { erpExportRoutes } from '../modules/erpExport/erpExport.routes.js';
import { portariaRoutes } from '../modules/portaria/portaria.routes.js';
import { importacaoRoutes } from '../modules/importacao/importacao.routes.js';

const API_PREFIX = '/api/v1';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes, { prefix: `${API_PREFIX}/auth` });
  await app.register(viagensRoutes, { prefix: `${API_PREFIX}/viagens` });
  await app.register(eventosRiscoNestedRoutes, { prefix: `${API_PREFIX}/viagens` });
  await app.register(groqRoutes, { prefix: `${API_PREFIX}/viagens` });
  await app.register(fronteiraNestedRoutes, { prefix: `${API_PREFIX}/viagens` });
  await app.register(validacaoPreEmbarqueRoutes, { prefix: `${API_PREFIX}/viagens` });
  await app.register(documentosEmbarqueNestedRoutes, { prefix: `${API_PREFIX}/viagens` });
  await app.register(fretesNestedRoutes, { prefix: `${API_PREFIX}/viagens` });
  await app.register(veiculosRoutes, { prefix: `${API_PREFIX}/veiculos` });
  await app.register(motoristasRoutes, { prefix: `${API_PREFIX}/motoristas` });
  await app.register(eventosRiscoDirectRoutes, { prefix: `${API_PREFIX}/eventos-risco` });
  await app.register(apolicesRoutes, { prefix: `${API_PREFIX}/apolices-seguro` });
  await app.register(fronteiraDirectRoutes, { prefix: `${API_PREFIX}/fronteira` });
  await app.register(documentosEmbarqueDirectRoutes, {
    prefix: `${API_PREFIX}/documentos-embarque`,
  });
  await app.register(fretesDirectRoutes, { prefix: `${API_PREFIX}/fretes` });
  await app.register(frotaRoutes, { prefix: `${API_PREFIX}/frota` });
  await app.register(jornadaRoutes, { prefix: `${API_PREFIX}/jornada` });
  await app.register(wmsRoutes, { prefix: `${API_PREFIX}/wms` });
  await app.register(erpExportRoutes, { prefix: `${API_PREFIX}/erp-export` });
  await app.register(portariaRoutes, { prefix: `${API_PREFIX}/portaria` });
  await app.register(importacaoRoutes, { prefix: `${API_PREFIX}/importacoes` });
}
