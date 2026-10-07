import { FrotaService } from '../frota/frota.service.js';
import { JornadaService } from '../jornada/jornada.service.js';
import { PortariaService } from '../portaria/portaria.service.js';
import { KpisService as WmsKpisService } from '../wms/kpis.service.js';
import { RedesService } from '../wms/redes.service.js';
import { TABELAS } from '../adminDados/adminDados.service.js';
import { ChatbotRepository } from './chatbot.repository.js';

/**
 * Registry de fontes de dados do RIGABRAS AI (snapshot do chatbot).
 *
 * Cada fonte declara `chave` (nome no snapshot), `rotulo` (exibido ao usuário
 * em "Fontes:"), `tabelas` (tabelas cobertas) e `coletar()`. Para adicionar
 * um módulo novo à IA, basta UM registro em `criarFontes()` — a lista de
 * rótulos exibida na tela é derivada do próprio registry, nunca de uma lista
 * hardcoded separada (causa raiz do bug "IA não sabe responder sobre redes").
 *
 * A última fonte (`demaisTabelas`) é COBERTURA AUTOMÁTICA: pega toda tabela
 * de negócio do catálogo `TABELAS` (adminDados) que nenhuma fonte dedicada
 * cobriu e coloca amostra das 3 linhas mais recentes no snapshot — assim
 * qualquer dado/tab nova lançado no sistema já aparece para a IA sem mexer
 * em código (limitado pelo orçamento de poda do prompt).
 */
export interface FonteIa {
  chave: string;
  rotulo: string;
  tabelas: string[];
  coletar(): Promise<Record<string, unknown>>;
}

export interface DependenciasFontes {
  repo?: ChatbotRepository;
  frota?: FrotaService;
  jornada?: JornadaService;
  portaria?: PortariaService;
  wmsKpis?: WmsKpisService;
  redes?: RedesService;
}

/** Tabelas cobertas pelas fontes dedicadas (não repetidas na cobertura automática). */
const TABELAS_DEDICADAS = [
  'viagens',
  'fretes',
  'portaria_entradas',
  'veiculos',
  'manutencoes_veiculo',
  'enderecos_armazem',
  'movimentacoes_estoque',
  'estoque',
  'avarias',
  'recebimentos',
  'expedicoes',
  'registros_jornada',
  'motoristas',
  'eventos_risco',
  'redes',
  'depositantes',
  'produtos_armazenados',
  'clientes',
];

export function criarFontes(deps: DependenciasFontes = {}): FonteIa[] {
  const repo = deps.repo ?? new ChatbotRepository();
  const frota = deps.frota ?? new FrotaService();
  const jornada = deps.jornada ?? new JornadaService();
  const portaria = deps.portaria ?? new PortariaService();
  const wmsKpis = deps.wmsKpis ?? new WmsKpisService();
  const redes = deps.redes ?? new RedesService();

  const dedicadas: FonteIa[] = [
    {
      chave: 'viagens',
      rotulo: 'viagens (TMS)',
      tabelas: ['viagens'],
      coletar: async () => {
        const [porStatus, documentacaoPendente] = await Promise.all([
          repo.getViagensPorStatus(),
          repo.countDocumentacaoPendente(),
        ]);
        return {
          total: porStatus.total,
          porStatus: porStatus.porStatus,
          documentacaoPendente,
        };
      },
    },
    {
      chave: 'financeiroFrete',
      rotulo: 'fretes (financeiro)',
      tabelas: ['fretes'],
      coletar: async () => {
        const pendentes = await repo.getFretesPendentesAprovacao();
        return {
          fretesPendentesAprovacao: pendentes.quantidade,
          valorTotalPendenteAprovacao: pendentes.valorTotal,
        };
      },
    },
    {
      chave: 'portaria',
      rotulo: 'portaria_entradas',
      tabelas: ['portaria_entradas'],
      coletar: async () => {
        const [kpis, veiculoNoPatio] = await Promise.all([
          portaria.getKpis(),
          repo.getVeiculoComMaisTempoNoPatio(),
        ]);
        return { ...kpis, veiculoComMaisTempoNoPatio: veiculoNoPatio };
      },
    },
    {
      chave: 'frota',
      rotulo: 'frota (manutenções + quilometragem)',
      tabelas: ['veiculos', 'manutencoes_veiculo'],
      coletar: async () => {
        const kpis = await frota.getKpis({});
        return {
          frotaTotal: kpis.frota_total,
          veiculosDisponiveis: kpis.veiculos_disponiveis,
          veiculosEmViagem: kpis.veiculos_em_viagem,
          percentualOcupacao: kpis.percentual_ocupacao,
          percentualKmVazio: kpis.percentual_km_vazio,
          consumoMedioKmPorLitro: kpis.consumo_medio_km_litro,
          custoKmFrota: kpis.custo_km_frota,
        };
      },
    },
    {
      chave: 'warehouse',
      rotulo: 'wms (endereços, avarias, recebimentos, expedições)',
      tabelas: [
        'enderecos_armazem',
        'movimentacoes_estoque',
        'estoque',
        'avarias',
        'recebimentos',
        'expedicoes',
      ],
      coletar: async () => {
        const kpis = await wmsKpis.getKpis({});
        return {
          percentualOcupacao: kpis.ocupacao.percentual_ocupacao,
          enderecosOcupados: kpis.ocupacao.enderecos_ocupados,
          enderecosLivres: kpis.ocupacao.enderecos_livres,
          avariasPorSeveridade: kpis.avarias_por_severidade,
          recebimentosAbertos: kpis.recebimentos_abertos,
          expedicoesAbertas: kpis.expedicoes_abertas,
          giroEstoque: kpis.giro_estoque.giro,
        };
      },
    },
    {
      chave: 'jornada',
      rotulo: 'jornada (registros_jornada + motoristas)',
      tabelas: ['registros_jornada', 'motoristas'],
      coletar: async () => {
        const alertas = await jornada.getAlertas();
        return {
          quantidadeMotoristasComAlerta: alertas.length,
          motoristas: alertas.map((a) => ({
            nome: a.motorista_nome,
            sessaoAberta: a.sessao_aberta,
            qtdAchados: a.achados.length,
          })),
        };
      },
    },
    {
      chave: 'redes',
      rotulo: 'redes de contenção do WMS (checklist + movimentações)',
      tabelas: ['redes', 'rede_movimentacoes'],
      coletar: async () => {
        const kpis = await redes.kpis();
        return {
          total: kpis.total,
          disponiveis: kpis.disponiveis,
          emTransito: kpis.em_transito,
          vencendo30Dias: kpis.vencendo,
          vencidas: kpis.vencidas,
          padraoCliente: kpis.padrao_cliente,
          checklistConcluidos: kpis.checklist_concluidos,
          checklistPendentes: kpis.checklist_pendentes,
          percentualChecklist:
            kpis.total > 0 ? Math.round((kpis.checklist_concluidos / kpis.total) * 100) : 0,
        };
      },
    },
    {
      chave: 'riscos',
      rotulo: 'eventos de risco (gerenciamento de risco)',
      tabelas: ['eventos_risco'],
      coletar: async () => repo.getEventosRiscoResumo(),
    },
    {
      chave: 'cadastros',
      rotulo: 'cadastros (depositantes, produtos, clientes, motoristas, veículos)',
      tabelas: ['depositantes', 'produtos_armazenados', 'clientes', 'motoristas', 'veiculos'],
      coletar: async () => {
        const tabelas = ['depositantes', 'produtos_armazenados', 'clientes', 'motoristas', 'veiculos'];
        const contagens = await Promise.all(tabelas.map((t) => repo.contarTabela(t)));
        return Object.fromEntries(tabelas.map((t, i) => [t, contagens[i] ?? 0]));
      },
    },
  ];

  const cobertas = new Set(TABELAS_DEDICADAS);
  const automatica: FonteIa = {
    chave: 'demaisTabelas',
    rotulo: 'demais registros do sistema (cobertura automática)',
    tabelas: [],
    coletar: async () => {
      const alvos = TABELAS.map((t) => t.tabela).filter((t) => !cobertas.has(t));
      const linhas = await Promise.all(alvos.map((t) => repo.getLinhasRecentes(t, 3)));
      const amostras: Record<string, unknown> = {};
      let cobertasAgora = 0;
      alvos.forEach((tabela, i) => {
        const rows = linhas[i];
        if (rows && rows.length > 0) {
          amostras[tabela] = rows;
          cobertasAgora += 1;
        }
      });
      automatica.rotulo =
        cobertasAgora > 0
          ? `demais registros do sistema (cobertura automática: ${cobertasAgora} tabelas)`
          : 'demais registros do sistema (cobertura automática: sem dados)';
      return amostras;
    },
  };

  return [...dedicadas, automatica];
}
