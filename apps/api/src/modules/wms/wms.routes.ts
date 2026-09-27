import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { DepositantesController } from './depositantes.controller.js';
import { ProdutosController } from './produtos.controller.js';
import { EnderecosController } from './enderecos.controller.js';
import { RecebimentosController } from './recebimentos.controller.js';
import { ExpedicoesController } from './expedicoes.controller.js';
import { AvariasController } from './avarias.controller.js';
import { InventariosController } from './inventarios.controller.js';
import { KpisController } from './kpis.controller.js';

const LEITURA_TODOS = requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE');
const ESCRITA_OPERACIONAL = requireRole('SUPERADMIN', 'ADMIN', 'OPERADOR');
const ESCRITA_ADMIN = requireRole('SUPERADMIN', 'ADMIN');

/**
 * Rotas do Módulo 5 (WMS — Armazém Geral, Decreto 1.102/1903). RBAC (ver
 * racional completo na migration 0006 e em docs/NOTES.md):
 *  - Leitura (cadastros, mapa de ocupação, KPIs, rastreabilidade) aberta a
 *    todos os papéis autenticados, inclusive VISITANTE.
 *  - Trabalho de piso (recebimento/conferência, separação/expedição,
 *    avarias, abertura e contagem de inventário) liberado para OPERADOR —
 *    mesmo padrão operacional dos Módulos 2-4.
 *  - A RECONCILIAÇÃO de inventário (gera ajustes de estoque com efeito
 *    financeiro/contratual sobre o depositante) fica restrita a
 *    ADMIN/SUPERADMIN, mesmo racional da aprovação financeira do Módulo 3.
 *  - Exclusão (soft delete) de cadastros restrita a ADMIN/SUPERADMIN.
 */
export async function wmsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);

  // ------------------------------------------------------------------
  // Depositantes
  // ------------------------------------------------------------------
  app.get('/depositantes', { preHandler: LEITURA_TODOS }, DepositantesController.list);
  app.get('/depositantes/:id', { preHandler: LEITURA_TODOS }, DepositantesController.getById);
  app.post('/depositantes', { preHandler: ESCRITA_OPERACIONAL }, DepositantesController.create);
  app.patch(
    '/depositantes/:id',
    { preHandler: ESCRITA_OPERACIONAL },
    DepositantesController.update,
  );
  app.delete('/depositantes/:id', { preHandler: ESCRITA_ADMIN }, DepositantesController.remove);

  // ------------------------------------------------------------------
  // Produtos armazenados
  // ------------------------------------------------------------------
  app.get('/produtos', { preHandler: LEITURA_TODOS }, ProdutosController.list);
  app.get('/produtos/:id', { preHandler: LEITURA_TODOS }, ProdutosController.getById);
  app.post('/produtos', { preHandler: ESCRITA_OPERACIONAL }, ProdutosController.create);
  app.patch('/produtos/:id', { preHandler: ESCRITA_OPERACIONAL }, ProdutosController.update);
  app.delete('/produtos/:id', { preHandler: ESCRITA_ADMIN }, ProdutosController.remove);
  app.get(
    '/produtos/:produtoId/rastreio',
    { preHandler: LEITURA_TODOS },
    KpisController.rastrearProduto,
  );

  // ------------------------------------------------------------------
  // Endereços do armazém (mapa/ocupação)
  // ------------------------------------------------------------------
  app.get('/armazens', { preHandler: LEITURA_TODOS }, EnderecosController.listArmazens);
  app.get('/enderecos', { preHandler: LEITURA_TODOS }, EnderecosController.list);
  app.get('/enderecos/:id', { preHandler: LEITURA_TODOS }, EnderecosController.getById);
  app.post('/enderecos', { preHandler: ESCRITA_OPERACIONAL }, EnderecosController.create);
  app.patch('/enderecos/:id', { preHandler: ESCRITA_OPERACIONAL }, EnderecosController.update);
  app.delete('/enderecos/:id', { preHandler: ESCRITA_ADMIN }, EnderecosController.remove);

  // ------------------------------------------------------------------
  // Recebimento e Conferência
  // ------------------------------------------------------------------
  app.get('/recebimentos', { preHandler: LEITURA_TODOS }, RecebimentosController.list);
  app.get('/recebimentos/:id', { preHandler: LEITURA_TODOS }, RecebimentosController.getById);
  app.post('/recebimentos', { preHandler: ESCRITA_OPERACIONAL }, RecebimentosController.create);
  app.post(
    '/recebimentos/:id/iniciar-conferencia',
    { preHandler: ESCRITA_OPERACIONAL },
    RecebimentosController.iniciarConferencia,
  );
  app.patch(
    '/recebimentos/:id/itens/:itemId/conferir',
    { preHandler: ESCRITA_OPERACIONAL },
    RecebimentosController.conferirItem,
  );
  app.post(
    '/recebimentos/:id/concluir',
    { preHandler: ESCRITA_OPERACIONAL },
    RecebimentosController.concluirConferencia,
  );

  // ------------------------------------------------------------------
  // Separação, Reembalagem, Etiquetagem, Cross-docking e Expedição
  // ------------------------------------------------------------------
  app.get('/expedicoes', { preHandler: LEITURA_TODOS }, ExpedicoesController.list);
  app.get('/expedicoes/:id', { preHandler: LEITURA_TODOS }, ExpedicoesController.getById);
  app.post('/expedicoes', { preHandler: ESCRITA_OPERACIONAL }, ExpedicoesController.create);
  app.post(
    '/expedicoes/:id/iniciar-separacao',
    { preHandler: ESCRITA_OPERACIONAL },
    ExpedicoesController.iniciarSeparacao,
  );
  // Módulo 6 (Integração TMS+WMS): vincula a expedição a uma viagem do TMS.
  app.patch(
    '/expedicoes/:id/vincular-viagem',
    { preHandler: ESCRITA_OPERACIONAL },
    ExpedicoesController.vincularViagem,
  );
  app.patch(
    '/expedicoes/:id/itens/:itemId/separar',
    { preHandler: ESCRITA_OPERACIONAL },
    ExpedicoesController.separarItem,
  );
  app.patch(
    '/expedicoes/:id/itens/:itemId/reembalagem-etiquetagem',
    { preHandler: ESCRITA_OPERACIONAL },
    ExpedicoesController.marcarReembalagemEtiquetagem,
  );
  app.post(
    '/expedicoes/:id/concluir-separacao',
    { preHandler: ESCRITA_OPERACIONAL },
    ExpedicoesController.concluirSeparacao,
  );
  app.post(
    '/expedicoes/:id/pronta-expedicao',
    { preHandler: ESCRITA_OPERACIONAL },
    ExpedicoesController.marcarProntaExpedicao,
  );
  app.post(
    '/expedicoes/:id/expedir',
    { preHandler: ESCRITA_OPERACIONAL },
    ExpedicoesController.expedir,
  );
  app.post(
    '/expedicoes/:id/cancelar',
    { preHandler: ESCRITA_OPERACIONAL },
    ExpedicoesController.cancelar,
  );

  // ------------------------------------------------------------------
  // Controle de avarias
  // ------------------------------------------------------------------
  app.get('/avarias', { preHandler: LEITURA_TODOS }, AvariasController.list);
  app.get('/avarias/:id', { preHandler: LEITURA_TODOS }, AvariasController.getById);
  app.post('/avarias', { preHandler: ESCRITA_OPERACIONAL }, AvariasController.create);

  // ------------------------------------------------------------------
  // Inventário / contagem física
  // ------------------------------------------------------------------
  app.get('/inventarios', { preHandler: LEITURA_TODOS }, InventariosController.list);
  app.get('/inventarios/:id', { preHandler: LEITURA_TODOS }, InventariosController.getById);
  app.post('/inventarios', { preHandler: ESCRITA_OPERACIONAL }, InventariosController.create);
  app.post(
    '/inventarios/:id/iniciar-contagem',
    { preHandler: ESCRITA_OPERACIONAL },
    InventariosController.iniciarContagem,
  );
  app.patch(
    '/inventarios/:id/contagem',
    { preHandler: ESCRITA_OPERACIONAL },
    InventariosController.contarItem,
  );
  // Reconciliação: efeito financeiro/contratual sobre o depositante — restrita a ADMIN/SUPERADMIN (ver migration 0006).
  app.post(
    '/inventarios/:id/reconciliar',
    { preHandler: ESCRITA_ADMIN },
    InventariosController.reconciliar,
  );
  app.post(
    '/inventarios/:id/encerrar',
    { preHandler: ESCRITA_ADMIN },
    InventariosController.encerrar,
  );

  // ------------------------------------------------------------------
  // KPIs e rastreabilidade
  // ------------------------------------------------------------------
  app.get('/kpis', { preHandler: LEITURA_TODOS }, KpisController.getKpis);
  app.get(
    '/movimentacoes/:movimentacaoId/rastreio',
    { preHandler: LEITURA_TODOS },
    KpisController.rastrearMovimentacao,
  );
}
