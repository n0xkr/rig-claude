import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';
import { AdminDadosService } from './adminDados.service.js';

const service = new AdminDadosService();
const TabelaSchema = z.object({ tabela: z.string().regex(/^[a-z_]{2,63}$/) });
const RegistroSchema = TabelaSchema.extend({ id: z.string().min(1).max(64) });
const ListaQuery = z.object({
  q: z.string().max(200).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(1).max(200).default(50),
  excluidos: z.enum(['true', 'false']).default('false'),
});
const Celula = z.union([z.string().max(100000), z.number(), z.boolean(), z.null(), z.array(z.unknown()), z.record(z.unknown())]);
const DadosSchema = z.object({ dados: z.record(z.string().max(63), Celula) });
const ExcluirQuery = z.object({ definitivo: z.enum(['true', 'false']).default('false') });

async function run<T>(reply: FastifyReply, fn: () => Promise<T>, status = 200) {
  try {
    return reply.status(status).send(await fn());
  } catch (error) {
    if (error instanceof DomainError) {
      sendProblem(reply, error.status, error.message, error.detail);
      return;
    }
    throw error;
  }
}

/** Gerenciador de dados — criar/editar/excluir qualquer registro. Exclusivo do SUPERADMIN. */
export async function adminDadosRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);
  app.addHook('preHandler', requireRole('SUPERADMIN'));

  app.get('/', async (_req: FastifyRequest, reply: FastifyReply) => run(reply, async () => ({ data: await service.tabelas() })));

  app.get('/:tabela', async (request: FastifyRequest, reply: FastifyReply) => {
    const p = parseOrProblem(TabelaSchema, request.params, reply);
    const q = p && parseOrProblem(ListaQuery, request.query, reply);
    if (!p || !q) return;
    return run(reply, () =>
      service.listar(p.tabela, { q: q.q, pagina: q.pagina, porPagina: q.por_pagina, excluidos: q.excluidos === 'true' }),
    );
  });

  app.post('/:tabela', async (request: FastifyRequest, reply: FastifyReply) => {
    const p = parseOrProblem(TabelaSchema, request.params, reply);
    const b = p && parseOrProblem(DadosSchema, request.body, reply);
    if (!p || !b) return;
    return run(reply, () => service.criar(p.tabela, b.dados, request.user!.sub, request.ip), 201);
  });

  app.patch('/:tabela/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const p = parseOrProblem(RegistroSchema, request.params, reply);
    const b = p && parseOrProblem(DadosSchema, request.body, reply);
    if (!p || !b) return;
    return run(reply, () => service.atualizar(p.tabela, p.id, b.dados, request.user!.sub, request.ip));
  });

  app.delete('/:tabela/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const p = parseOrProblem(RegistroSchema, request.params, reply);
    const q = p && parseOrProblem(ExcluirQuery, request.query, reply);
    if (!p || !q) return;
    return run(reply, () => service.excluir(p.tabela, p.id, q.definitivo === 'true', request.user!.sub, request.ip));
  });
}
