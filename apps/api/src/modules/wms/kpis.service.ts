import type { RastreioProduto, WmsKpiResponse } from '@rigabras/shared';
import { EnderecosRepository } from './enderecos.repository.js';
import { EstoqueRepository } from './estoque.repository.js';
import { AvariasRepository } from './avarias.repository.js';
import { RecebimentosRepository } from './recebimentos.repository.js';
import { ExpedicoesRepository } from './expedicoes.repository.js';
import { calcularGiroEstoque, calcularPercentualOcupacao } from './estoqueLedger.js';
import { NotFoundError } from '../../lib/errors.js';

export interface WmsKpiFilter {
  armazemId?: string;
  periodStart?: string;
  periodEnd?: string;
}

const SOMENTE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * O front (`<input type="date">`) envia o período como `YYYY-MM-DD`; comparado
 * direto com `created_at` (timestamptz) o fim do período viraria meia-noite e
 * excluiria o dia inteiro. Expande para o início/fim do dia.
 */
function normalizarPeriodo(valor: string | undefined, fimDoDia: boolean): string | undefined {
  if (!valor) return undefined;
  if (!SOMENTE_DATA.test(valor)) return valor;
  return fimDoDia ? `${valor}T23:59:59.999Z` : `${valor}T00:00:00.000Z`;
}

const STATUS_RECEBIMENTO_ABERTOS = ['AGUARDANDO', 'EM_CONFERENCIA', 'CONFERIDO', 'DIVERGENTE'];
const STATUS_EXPEDICAO_ABERTAS = [
  'SOLICITADA',
  'EM_SEPARACAO',
  'SEPARADA',
  'EM_REEMBALAGEM',
  'PRONTA_EXPEDICAO',
];

/**
 * KPIs do Armazém Geral (Módulo 5, critério #6): ocupação (% de endereços
 * ocupados), giro de estoque e resumo de avarias por severidade. Também
 * expõe a rastreabilidade (histórico de um produto) — critério "given a
 * produto ou uma movimentação, show its full history".
 */
export class KpisService {
  constructor(
    private readonly enderecosRepo: EnderecosRepository = new EnderecosRepository(),
    private readonly estoqueRepo: EstoqueRepository = new EstoqueRepository(),
    private readonly avariasRepo: AvariasRepository = new AvariasRepository(),
    private readonly recebimentosRepo: RecebimentosRepository = new RecebimentosRepository(),
    private readonly expedicoesRepo: ExpedicoesRepository = new ExpedicoesRepository(),
  ) {}

  async getKpis(rawFilter: WmsKpiFilter): Promise<WmsKpiResponse> {
    const filter: WmsKpiFilter = {
      armazemId: rawFilter.armazemId,
      periodStart: normalizarPeriodo(rawFilter.periodStart, false),
      periodEnd: normalizarPeriodo(rawFilter.periodEnd, true),
    };
    const enderecos = await this.enderecosRepo.listAll(filter.armazemId);
    const ocupados = enderecos.filter((e) => e.status === 'OCUPADO').length;
    const livres = enderecos.filter((e) => e.status === 'LIVRE').length;
    const bloqueados = enderecos.filter((e) => e.status === 'BLOQUEADO').length;

    // Só EXPEDICAO conta como saída: em expedições CROSS_DOCKING o item já gera
    // uma movimentação CROSS_DOCKING na separação e outra EXPEDICAO ao expedir
    // (somar as duas contaria a mesma mercadoria em dobro).
    const movimentacoes = await this.estoqueRepo.listMovimentacoesByFilter({
      tipo: 'EXPEDICAO',
      periodStart: filter.periodStart,
      periodEnd: filter.periodEnd,
    });
    const quantidadeExpedidaPeriodo = movimentacoes.reduce((acc, m) => acc + m.quantidade, 0);

    // Saldo médio do período: aproximado pelo saldo ATUAL total dos endereços
    // do armazém filtrado (não há snapshots históricos de saldo neste
    // módulo — ver docs/NOTES.md para uma evolução futura com séries
    // temporais de saldo).
    const saldoAtualTotal = await this.estoqueRepo.listSaldoTotalPorEnderecos(
      enderecos.map((e) => e.id),
    );

    const avarias = await this.avariasRepo.countBySeveridade(filter.periodStart, filter.periodEnd);
    const avariasPorSeveridade: Record<string, number> = {};
    for (const avaria of avarias) {
      avariasPorSeveridade[avaria.severidade] = (avariasPorSeveridade[avaria.severidade] ?? 0) + 1;
    }

    const [recebimentosAbertos, expedicoesAbertas] = await Promise.all([
      this.countRecebimentosAbertos(),
      this.countExpedicoesAbertas(),
    ]);

    return {
      periodo: { inicio: filter.periodStart ?? null, fim: filter.periodEnd ?? null },
      ocupacao: {
        total_enderecos: enderecos.length,
        enderecos_ocupados: ocupados,
        enderecos_livres: livres,
        enderecos_bloqueados: bloqueados,
        percentual_ocupacao: calcularPercentualOcupacao(enderecos.length, ocupados),
      },
      giro_estoque: {
        quantidade_expedida_periodo: quantidadeExpedidaPeriodo,
        saldo_medio_periodo: saldoAtualTotal,
        giro: calcularGiroEstoque(quantidadeExpedidaPeriodo, saldoAtualTotal),
      },
      avarias_por_severidade: avariasPorSeveridade,
      recebimentos_abertos: recebimentosAbertos,
      expedicoes_abertas: expedicoesAbertas,
    };
  }

  private async countRecebimentosAbertos(): Promise<number> {
    let total = 0;
    for (const status of STATUS_RECEBIMENTO_ABERTOS) {
      const { data } = await this.recebimentosRepo.list({
        status: status as never,
        limit: 1000,
      });
      total += data.length;
    }
    return total;
  }

  private async countExpedicoesAbertas(): Promise<number> {
    let total = 0;
    for (const status of STATUS_EXPEDICAO_ABERTAS) {
      const { data } = await this.expedicoesRepo.list({ status: status as never, limit: 1000 });
      total += data.length;
    }
    return total;
  }

  /**
   * Rastreabilidade (critério "traceability"): histórico completo de
   * movimentações de um produto, do mais recente ao mais antigo, com o
   * saldo total atual. Retorna um rastreio vazio (nunca 404) quando o
   * produto ainda não teve nenhuma movimentação — a checagem de existência
   * do produto em si é feita pelo controller que chama este método a
   * partir da rota aninhada em produtos.
   */
  async rastrearProduto(produtoId: string): Promise<RastreioProduto> {
    const eventos = await this.estoqueRepo.listMovimentacoesByProduto(produtoId, 200);
    const saldoAtualTotal = await this.estoqueRepo.listSaldoTotalPorProduto(produtoId);
    return {
      produto_id: produtoId,
      saldo_atual_total: saldoAtualTotal,
      eventos: eventos.map((m) => ({
        movimentacao_id: m.id,
        tipo_movimentacao: m.tipo_movimentacao,
        quantidade: m.quantidade,
        endereco_origem_id: m.endereco_origem_id ?? null,
        endereco_destino_id: m.endereco_destino_id ?? null,
        referencia_documento: m.referencia_documento ?? null,
        created_at: m.created_at ?? '',
      })),
    };
  }

  async rastrearMovimentacao(movimentacaoId: string) {
    const movimentacao = await this.estoqueRepo.findMovimentacaoById(movimentacaoId);
    if (!movimentacao) throw new NotFoundError('movimentacao_estoque', movimentacaoId);
    return movimentacao;
  }
}
