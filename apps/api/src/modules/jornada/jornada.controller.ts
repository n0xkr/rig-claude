import type { FastifyReply, FastifyRequest } from 'fastify';
import { CreateRegistroJornadaSchema } from '@rigabras/shared';
import { JornadaService } from './jornada.service.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';
import { toCsv } from '../../lib/csv.js';

const service = new JornadaService();

/** Usa `sendProblem(reply, error.status, ...)` desde a criação deste módulo — nunca o padrão antigo com `.status()` depois de `.send()` (bug corrigido nos Módulos 1/2, ver `docs/NOTES.md`). */
function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    sendProblem(reply, error.status, error.message, error.detail);
    return true;
  }
  return false;
}

export const JornadaController = {
  async registrarEvento(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(CreateRegistroJornadaSchema, request.body, reply);
    if (!body) return;
    try {
      const created = await service.registrarEvento(body, request.user?.sub ?? null, request.ip);
      return reply.status(201).send(created);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async removeEvento(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      await service.softDeleteEvento(id, request.user?.sub ?? null, request.ip);
      return reply.status(204).send();
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async listEventosByMotorista(request: FastifyRequest, reply: FastifyReply) {
    const { motoristaId } = request.params as { motoristaId: string };
    const query = request.query as { periodStart?: string; periodEnd?: string };
    try {
      const eventos = await service.listEventosByMotorista(motoristaId, {
        periodStart: query.periodStart,
        periodEnd: query.periodEnd,
      });
      return reply.send(eventos);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async getHistorico(request: FastifyRequest, reply: FastifyReply) {
    const { motoristaId } = request.params as { motoristaId: string };
    const query = request.query as { periodStart?: string; periodEnd?: string; format?: string };
    try {
      const historico = await service.getHistorico(motoristaId, {
        periodStart: query.periodStart,
        periodEnd: query.periodEnd,
      });

      if (query.format === 'csv') {
        const rows = historico.sessoes.map((sessao) => ({
          motorista: historico.motorista_nome,
          inicio_jornada: sessao.inicio_jornada ?? '',
          fim_jornada: sessao.fim_jornada ?? '',
          aberta: sessao.aberta ? 'SIM' : 'NAO',
          tempo_jornada_minutos: sessao.tempo_jornada_minutos ?? '',
          tempo_direcao_minutos: sessao.tempo_direcao_minutos,
          tempo_espera_minutos: sessao.tempo_espera_minutos,
          tempo_descanso_minutos: sessao.tempo_descanso_minutos,
          descanso_seguinte_minutos: sessao.descanso_seguinte_minutos ?? '',
          achados: sessao.achados.map((a) => `[${a.severidade}] ${a.mensagem}`).join(' | '),
        }));
        const csv = toCsv(rows, [
          'motorista',
          'inicio_jornada',
          'fim_jornada',
          'aberta',
          'tempo_jornada_minutos',
          'tempo_direcao_minutos',
          'tempo_espera_minutos',
          'tempo_descanso_minutos',
          'descanso_seguinte_minutos',
          'achados',
        ]);
        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="jornada-${motoristaId}.csv"`)
          .send(csv);
      }

      return reply.send(historico);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async getAlertas(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { janelaDias?: string };
    try {
      const alertas = await service.getAlertas(
        query.janelaDias ? Number(query.janelaDias) : undefined,
      );
      return reply.send(alertas);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
};
