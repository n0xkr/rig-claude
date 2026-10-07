import type { FastifyReply, FastifyRequest } from 'fastify';
import { PeriodoExportacaoQuerySchema } from '@rigabras/shared';
import { ErpExportService } from './erpExport.service.js';
import { ERP_ESTOQUE_COLUNAS, ERP_FINANCEIRO_COLUNAS } from './erpExport.columns.js';
import { parseOrProblem } from '../../middleware/validate.js';
import { sendProblem } from '../../lib/problemDetails.js';
import { DomainError } from '../../lib/errors.js';
import { toCsv } from '../../lib/csv.js';

const service = new ErpExportService();

function handleDomainError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof DomainError) {
    sendProblem(reply, error.status, error.message, error.detail);
    return true;
  }
  return false;
}

/**
 * Módulo 7 (Integração ERP): `formato=json` retorna o array tipado
 * diretamente (para a tela "Exportações" exibir/inspecionar), `formato=csv`
 * retorna um anexo baixável — mesmo padrão do histórico de jornada
 * (Módulo 4, `jornada.controller.ts`).
 */
export const ErpExportController = {
  async financeiro(request: FastifyRequest, reply: FastifyReply) {
    const query = parseOrProblem(PeriodoExportacaoQuerySchema, request.query, reply);
    if (!query) return;
    try {
      const registros = await service.exportarFinanceiro({ inicio: query.inicio, fim: query.fim });
      if (query.formato === 'csv') {
        const csv = toCsv(
          registros as unknown as Record<string, unknown>[],
          ERP_FINANCEIRO_COLUNAS,
        );
        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header(
            'Content-Disposition',
            `attachment; filename="erp-financeiro-${query.inicio}_a_${query.fim}.csv"`,
          )
          .send(csv);
      }
      return reply.send(registros);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },

  async estoque(request: FastifyRequest, reply: FastifyReply) {
    const query = parseOrProblem(PeriodoExportacaoQuerySchema, request.query, reply);
    if (!query) return;
    try {
      const registros = await service.exportarEstoque({ inicio: query.inicio, fim: query.fim });
      if (query.formato === 'csv') {
        const csv = toCsv(registros as unknown as Record<string, unknown>[], ERP_ESTOQUE_COLUNAS);
        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header(
            'Content-Disposition',
            `attachment; filename="erp-estoque-${query.inicio}_a_${query.fim}.csv"`,
          )
          .send(csv);
      }
      return reply.send(registros);
    } catch (error) {
      if (handleDomainError(error, reply)) return;
      throw error;
    }
  },
};
