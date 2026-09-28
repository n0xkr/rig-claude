import type { FastifyReply, FastifyRequest } from 'fastify';
import { PerguntaChatbotSchema } from '@rigabras/shared';
import { ChatbotService } from './chatbot.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { GroqNotConfiguredError } from '../groq/groq.client.js';
import { logger } from '../../config/logger.js';
import { Problems } from '../../lib/problemDetails.js';

const service = new ChatbotService();

export const ChatbotController = {
  async perguntar(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(PerguntaChatbotSchema, request.body, reply);
    if (!body) return;
    try {
      const resultado = await service.perguntar(body.pergunta);
      return reply.send(resultado);
    } catch (error) {
      if (error instanceof GroqNotConfiguredError) {
        return reply.status(503).type('application/problem+json').send({
          type: 'about:blank',
          title: 'Serviço de IA indisponível',
          status: 503,
          detail: error.message,
          instance: request.url,
          correlationId: request.id,
        });
      }
      logger.error({ err: error }, 'Falha ao processar pergunta do RIGABRAS AI');
      return Problems.internal(reply, 'Falha ao processar a pergunta via IA');
    }
  },
};
