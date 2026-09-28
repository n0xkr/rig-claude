import type { RespostaChatbot } from '@rigabras/shared';
import { askOperationalQuestion } from '../groq/groq.client.js';
import { ChatbotRepository } from './chatbot.repository.js';
import { FrotaService } from '../frota/frota.service.js';
import { JornadaService } from '../jornada/jornada.service.js';
import { PortariaService } from '../portaria/portaria.service.js';
import { KpisService as WmsKpisService } from '../wms/kpis.service.js';

/**
 * RIGABRAS AI (Módulo 10): monta um snapshot operacional AO VIVO a partir
 * dos módulos já existentes (portaria, frota, jornada, WMS, financeiro de
 * frete, TMS) e só então chama a Groq — a "regra de ouro" (seção 29 do
 * documento de evolução) é reforçada estruturalmente aqui: o modelo nunca
 * vê o banco de dados diretamente, só este snapshot já validado.
 */
export class ChatbotService {
  constructor(
    private readonly repo: ChatbotRepository = new ChatbotRepository(),
    private readonly frotaService: FrotaService = new FrotaService(),
    private readonly jornadaService: JornadaService = new JornadaService(),
    private readonly portariaService: PortariaService = new PortariaService(),
    private readonly wmsKpisService: WmsKpisService = new WmsKpisService(),
  ) {}

  private async montarSnapshot(): Promise<Record<string, unknown>> {
    const [
      viagensPorStatus,
      fretesPendentes,
      veiculoNoPatio,
      documentacaoPendente,
      portariaKpis,
      frotaKpis,
      wmsKpis,
      alertasJornada,
    ] = await Promise.all([
      this.repo.getViagensPorStatus(),
      this.repo.getFretesPendentesAprovacao(),
      this.repo.getVeiculoComMaisTempoNoPatio(),
      this.repo.countDocumentacaoPendente(),
      this.portariaService.getKpis(),
      this.frotaService.getKpis({}),
      this.wmsKpisService.getKpis({}),
      this.jornadaService.getAlertas(),
    ]);

    return {
      geradoEm: new Date().toISOString(),
      viagens: viagensPorStatus,
      viagensComDocumentacaoPendente: documentacaoPendente,
      financeiroFrete: {
        fretesPendentesAprovacao: fretesPendentes.quantidade,
        valorTotalPendenteAprovacao: fretesPendentes.valorTotal,
      },
      portaria: {
        ...portariaKpis,
        veiculoComMaisTempoNoPatio: veiculoNoPatio,
      },
      frota: {
        frotaTotal: frotaKpis.frota_total,
        veiculosDisponiveis: frotaKpis.veiculos_disponiveis,
        veiculosEmViagem: frotaKpis.veiculos_em_viagem,
        percentualOcupacao: frotaKpis.percentual_ocupacao,
        percentualKmVazio: frotaKpis.percentual_km_vazio,
        consumoMedioKmPorLitro: frotaKpis.consumo_medio_km_litro,
        custoKmFrota: frotaKpis.custo_km_frota,
      },
      warehouse: {
        percentualOcupacao: wmsKpis.ocupacao.percentual_ocupacao,
        enderecosOcupados: wmsKpis.ocupacao.enderecos_ocupados,
        enderecosLivres: wmsKpis.ocupacao.enderecos_livres,
        avariasPorSeveridade: wmsKpis.avarias_por_severidade,
        recebimentosAbertos: wmsKpis.recebimentos_abertos,
        expedicoesAbertas: wmsKpis.expedicoes_abertas,
        giroEstoque: wmsKpis.giro_estoque.giro,
      },
      jornada: {
        quantidadeMotoristasComAlerta: alertasJornada.length,
        motoristas: alertasJornada.map((a) => ({
          nome: a.motorista_nome,
          sessaoAberta: a.sessao_aberta,
          qtdAchados: a.achados.length,
        })),
      },
    };
  }

  async perguntar(pergunta: string): Promise<RespostaChatbot> {
    const snapshot = await this.montarSnapshot();
    const resposta = await askOperationalQuestion(pergunta, JSON.stringify(snapshot, null, 2));
    return {
      resposta,
      fontesDados: [
        'viagens (TMS)',
        'fretes (financeiro)',
        'portaria_entradas',
        'frota (manutenções + quilometragem)',
        'wms (endereços, avarias, recebimentos, expedições)',
        'jornada (registros_jornada)',
      ],
      geradoEm: snapshot.geradoEm as string,
    };
  }
}
