import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireModulo, type RegraModulo } from '../middleware/auth.js';
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
import { chatbotRoutes } from '../modules/chatbot/chatbot.routes.js';
import { auditoriaRoutes } from '../modules/auditoria/auditoria.routes.js';
import { usuariosRoutes } from '../modules/usuarios/usuarios.routes.js';
import { perfilRoutes } from '../modules/perfil/perfil.routes.js';
import {
  iaSolicitacoesRoutes,
  importacaoLotesRoutes,
} from '../modules/iaSolicitacoes/iaSolicitacoes.routes.js';
import { acompanhamentoRoutes } from '../modules/acompanhamento/acompanhamento.routes.js';
import { categoriasRoutes } from '../modules/categorias/categorias.routes.js';

const API_PREFIX = '/api/v1';

/**
 * Registra os plugins de um módulo sob um escopo com a guarda de permissão por
 * módulo (categorias de usuário). O `authenticate` de cada plugin é `onRequest`
 * e roda antes deste `preHandler`; o RBAC por papel continua em cada rota.
 */
async function registrarModulo(
  app: FastifyInstance,
  prefix: string,
  regra: RegraModulo,
  plugins: FastifyPluginAsync[],
): Promise<void> {
  await app.register(
    async (escopo) => {
      escopo.addHook('preHandler', requireModulo(regra));
      for (const plugin of plugins) await escopo.register(plugin);
    },
    { prefix: `${API_PREFIX}${prefix}` },
  );
}

// Telas de um módulo que também leem dados de outros (ex.: o Painel lê viagens
// e KPIs da frota; Fretes e Portaria abrem a viagem) — só leitura (GET).
const VIAGENS: RegraModulo = {
  modulos: ['viagens'],
  leitura: ['painel', 'fretes', 'fronteira', 'portaria', 'wms'],
};

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Sem guarda de módulo: autenticação, cadastros-base e administração.
  await app.register(authRoutes, { prefix: `${API_PREFIX}/auth` });
  await app.register(motoristasRoutes, { prefix: `${API_PREFIX}/motoristas` });
  await app.register(auditoriaRoutes, { prefix: `${API_PREFIX}/auditoria` });
  await app.register(usuariosRoutes, { prefix: `${API_PREFIX}/usuarios` });
  await app.register(categoriasRoutes, { prefix: `${API_PREFIX}/categorias-usuario` });
  await app.register(perfilRoutes, { prefix: `${API_PREFIX}/perfil` });

  await registrarModulo(app, '/viagens', VIAGENS, [
    viagensRoutes,
    eventosRiscoNestedRoutes,
    groqRoutes,
    fronteiraNestedRoutes,
    validacaoPreEmbarqueRoutes,
    documentosEmbarqueNestedRoutes,
    fretesNestedRoutes,
  ]);
  await registrarModulo(app, '/eventos-risco', VIAGENS, [eventosRiscoDirectRoutes]);
  await registrarModulo(app, '/apolices-seguro', VIAGENS, [apolicesRoutes]);
  await registrarModulo(app, '/documentos-embarque', VIAGENS, [documentosEmbarqueDirectRoutes]);
  await registrarModulo(
    app,
    '/veiculos',
    { modulos: ['acompanhamento', 'frota'], leitura: 'todos' },
    [veiculosRoutes],
  );
  await registrarModulo(
    app,
    '/fronteira',
    { modulos: ['fronteira'], leitura: ['viagens', 'painel'] },
    [fronteiraDirectRoutes],
  );
  await registrarModulo(app, '/fretes', { modulos: ['fretes'], leitura: ['viagens'] }, [
    fretesDirectRoutes,
  ]);
  await registrarModulo(
    app,
    '/frota',
    { modulos: ['frota'], leitura: ['painel', 'acompanhamento'] },
    [frotaRoutes],
  );
  await registrarModulo(app, '/jornada', { modulos: ['jornada'] }, [jornadaRoutes]);
  await registrarModulo(app, '/wms', { modulos: ['wms'], leitura: ['viagens'] }, [wmsRoutes]);
  await registrarModulo(app, '/erp-export', { modulos: ['exportacoes'] }, [erpExportRoutes]);
  await registrarModulo(app, '/portaria', { modulos: ['portaria'] }, [portariaRoutes]);
  // A importação com IA também é aberta de dentro do Acompanhamento de veículos.
  await registrarModulo(app, '/importacoes', { modulos: ['importacao', 'acompanhamento'] }, [
    importacaoRoutes,
  ]);
  await registrarModulo(app, '/importacoes/lotes', { modulos: ['importacao', 'acompanhamento'] }, [
    importacaoLotesRoutes,
  ]);
  await registrarModulo(app, '/rigabras-ai', { modulos: ['rigabras_ai'] }, [chatbotRoutes]);
  await registrarModulo(
    app,
    '/ia-solicitacoes',
    { modulos: ['solicitacoes_ia'], leitura: ['importacao', 'acompanhamento'] },
    [iaSolicitacoesRoutes],
  );
  await registrarModulo(app, '/acompanhamento', { modulos: ['acompanhamento'] }, [
    acompanhamentoRoutes,
  ]);
}
