import type { FastifyReply, FastifyRequest } from 'fastify';
import { supabaseAdmin } from '../../config/supabase.js';
import {
  analyzeViagemRisk,
  GroqNotConfiguredError,
  type ViagemRiskContext,
} from './groq.client.js';
import { Problems } from '../../lib/problemDetails.js';
import { logger } from '../../config/logger.js';

export const GroqController = {
  /**
   * POST /api/v1/viagens/:id/analise-risco
   * Monta o contexto de risco da viagem (dados da viagem + eventos_risco
   * recentes) e envia para a Groq, retornando um risco/anomalia estruturado.
   */
  async analyzeViagem(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    // viagens.id é uuid: um id malformado causaria erro 22P02 no banco (antes virava 404 falso).
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Problems.badRequest(reply, `Id de viagem inválido: ${id}`);
    }

    const { data: viagem, error: viagemError } = await supabaseAdmin
      .from('viagens')
      .select(
        'numero_crt, origem, destino, pais_destino, status, data_programacao, data_coleta, data_inicio_viagem',
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (viagemError) {
      logger.error({ err: viagemError, viagemId: id }, 'Falha ao consultar a viagem para análise de risco');
      return Problems.internal(reply, 'Falha ao consultar a viagem');
    }
    if (!viagem) {
      return Problems.notFound(reply, `Viagem ${id} não encontrada`);
    }

    const { data: eventos, error: eventosError } = await supabaseAdmin
      .from('eventos_risco')
      .select('tipo, severidade, descricao')
      .eq('viagem_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10);
    if (eventosError) {
      logger.error({ err: eventosError, viagemId: id }, 'Falha ao consultar eventos de risco');
      return Problems.internal(reply, 'Falha ao consultar os eventos de risco da viagem');
    }

    const context: ViagemRiskContext = {
      numeroCrt: viagem.numero_crt,
      origem: viagem.origem,
      destino: viagem.destino,
      paisDestino: viagem.pais_destino,
      status: viagem.status,
      dataProgramacao: viagem.data_programacao,
      dataColeta: viagem.data_coleta,
      dataInicioViagem: viagem.data_inicio_viagem,
      eventosRiscoRecentes: eventos ?? [],
    };

    try {
      const result = await analyzeViagemRisk(context);
      return reply.send(result);
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
      logger.error({ err: error, viagemId: id }, 'Falha ao chamar Groq para análise de risco');
      return Problems.internal(reply, 'Falha ao processar análise de risco via IA');
    }
  },
};
