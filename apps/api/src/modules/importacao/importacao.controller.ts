import type { FastifyReply, FastifyRequest } from 'fastify';
import { CommitImportacaoInputSchema, ValidarImportacaoInputSchema } from '@rigabras/shared';
import { ImportacaoService } from './importacao.service.js';
import { parseOrProblem } from '../../middleware/validate.js';

const service = new ImportacaoService();

export const ImportacaoController = {
  async validar(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(ValidarImportacaoInputSchema, request.body, reply);
    if (!body) return;
    const resultado = await service.validar(body.target, body.linhas);
    return reply.send(resultado);
  },

  async importar(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(CommitImportacaoInputSchema, request.body, reply);
    if (!body) return;
    const resultado = await service.importar(
      body.target,
      body.nome,
      body.origem,
      body.linhas,
      request.user?.sub ?? null,
      request.ip,
    );
    return reply.status(201).send(resultado);
  },

  async listDatasets(_request: FastifyRequest, reply: FastifyReply) {
    const datasets = await service.listDatasets();
    return reply.send(datasets);
  },
};
