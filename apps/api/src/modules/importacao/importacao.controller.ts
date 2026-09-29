import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  AnalisarPlanilhaInputSchema,
  CommitImportacaoInputSchema,
  ImportacaoInteligenteInputSchema,
  ValidarImportacaoInputSchema,
} from '@rigabras/shared';
import { ImportacaoService } from './importacao.service.js';
import { analisarPlanilha } from './importacao.ia.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';
import { ImportacaoInteligenteService } from './inteligente/inteligente.service.js';

const service = new ImportacaoService();
const inteligente = new ImportacaoInteligenteService();

export const ImportacaoController = {
  /** Importação inteligente: lê todas as abas, entende, cruza e (em `gravar`) grava tudo. */
  async inteligente(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(ImportacaoInteligenteInputSchema, request.body, reply);
    if (!body) return;
    try {
      const r = await inteligente.executar(body, request.user?.sub ?? null, request.ip);
      return reply.status(body.modo === 'gravar' ? 201 : 200).send(r);
    } catch (error) {
      if (error instanceof DomainError) return sendProblem(reply, error.status, error.message, error.detail);
      throw error;
    }
  },

  /** IA lê cabeçalhos + amostra e sugere alvo, mapeamento de colunas e normalização de valores. */
  async analisar(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(AnalisarPlanilhaInputSchema, request.body, reply);
    if (!body) return;
    return reply.send(await analisarPlanilha(body));
  },

  async validar(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(ValidarImportacaoInputSchema, request.body, reply);
    if (!body) return;
    const resultado = await service.validar(body.target, body.linhas, body.criarVeiculosAusentes);
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
      body.criarVeiculosAusentes,
    );
    return reply.status(201).send(resultado);
  },

  async listDatasets(_request: FastifyRequest, reply: FastifyReply) {
    const datasets = await service.listDatasets();
    return reply.send(datasets);
  },
};
