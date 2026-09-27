import type { FastifyReply } from 'fastify';
import type { ProblemDetails } from '@rigabras/shared';

/**
 * Helper para enviar respostas de erro no padrão RFC 7807 (critério #5).
 */
export function sendProblem(
  reply: FastifyReply,
  status: number,
  title: string,
  detail?: string,
  extra?: Partial<ProblemDetails>,
): FastifyReply {
  const correlationId = reply.request?.id;
  const problem: ProblemDetails = {
    type: extra?.type ?? 'about:blank',
    title,
    status,
    detail,
    instance: reply.request?.url,
    correlationId,
    errors: extra?.errors,
  };
  return reply.status(status).type('application/problem+json').send(problem);
}

export const Problems = {
  badRequest: (reply: FastifyReply, detail?: string, errors?: Record<string, string[]>) =>
    sendProblem(reply, 400, 'Requisição inválida', detail, { errors }),
  unauthorized: (reply: FastifyReply, detail = 'Credenciais ausentes ou inválidas') =>
    sendProblem(reply, 401, 'Não autenticado', detail),
  forbidden: (reply: FastifyReply, detail = 'Você não tem permissão para executar esta ação') =>
    sendProblem(reply, 403, 'Acesso negado', detail),
  notFound: (reply: FastifyReply, detail = 'Recurso não encontrado') =>
    sendProblem(reply, 404, 'Não encontrado', detail),
  conflict: (reply: FastifyReply, detail?: string) => sendProblem(reply, 409, 'Conflito', detail),
  unprocessable: (reply: FastifyReply, detail?: string, errors?: Record<string, string[]>) =>
    sendProblem(reply, 422, 'Entidade não processável', detail, { errors }),
  internal: (reply: FastifyReply, detail = 'Erro interno do servidor') =>
    sendProblem(reply, 500, 'Erro interno', detail),
};
