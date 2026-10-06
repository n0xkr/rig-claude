import type {
  StatusViagem,
  SeveridadeRisco,
  StatusFechamentoFrete,
  TipoManutencaoVeiculo,
  TipoEventoJornada,
  StatusEnderecoArmazem,
  StatusRecebimento,
  StatusExpedicao,
  SeveridadeAvaria,
  StatusInventario,
  StatusPortariaEntrada,
  StatusOrdemServico,
  StatusOperacionalVeiculo,
  StatusRede,
  CondicaoUsoRede,
} from '@rigabras/shared';
import { STATUS_VIAGEM_LABEL } from '@rigabras/shared';

const cor = {
  cinza: 'bg-slate-100 text-slate-700',
  ambar: 'bg-amber-50 text-amber-700',
  azul: 'bg-blue-50 text-blue-700',
  roxo: 'bg-purple-50 text-purple-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  ciano: 'bg-cyan-50 text-cyan-700',
  verde: 'bg-emerald-50 text-emerald-700',
  vermelho: 'bg-red-50 text-red-700',
  apagado: 'bg-slate-100 text-slate-500',
};

const STATUS_STYLES: Record<StatusViagem, string> = {
  PROGRAMADA: cor.cinza,
  EM_TRANSITO_CLIENTE: cor.ambar,
  NO_CLIENTE_AGUARDANDO_CARREGAMENTO: cor.ambar,
  CARREGADO_AGUARDANDO_DOCUMENTOS: cor.ambar,
  EM_TRANSITO_FRONTEIRA: cor.azul,
  NA_FRONTEIRA: cor.roxo,
  NA_FRONTEIRA_AGUARDANDO_CRUZE: cor.roxo,
  PROGRAMADO_CARREGAR: cor.roxo,
  CARREGADO: cor.roxo,
  ENTRADA_ADUANA_MULTILOG: cor.indigo,
  SAIDA_ADUANA_MULTILOG: cor.indigo,
  ENTRADA_ADUANA_COTECAR: cor.indigo,
  SAIDA_ADUANA_COTECAR: cor.indigo,
  CHEGADA_ADUANA_DESTINO: cor.ciano,
  SAIDA_ADUANA_DESTINO: cor.ciano,
  CHEGADA_CLIENTE: cor.verde,
  VAZIO_NO_CLIENTE: cor.verde,
  SAIDA_CLIENTE: cor.verde,
  RETORNANDO_VAZIO: cor.cinza,
  ENCERRADA: cor.apagado,
  CANCELADA: cor.vermelho,
  AGUARDANDO_COLETA: cor.apagado,
  EM_COLETA: cor.apagado,
  EM_DOCUMENTACAO: cor.apagado,
  VEICULO_MOTORISTA_DEFINIDO: cor.apagado,
  EM_VALIDACAO_PRE_EMBARQUE: cor.apagado,
  EM_TRANSITO: cor.apagado,
  EM_MONITORAMENTO: cor.apagado,
  ENTREGUE: cor.apagado,
};

export function StatusBadge({ status, agendada }: { status: StatusViagem; agendada?: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${agendada ? 'bg-sky-50 text-sky-700' : (STATUS_STYLES[status] ?? cor.cinza)}`}
    >
      {agendada ? 'Agendada' : (STATUS_VIAGEM_LABEL[status] ?? status.replaceAll('_', ' '))}
    </span>
  );
}

const SEVERIDADE_STYLES: Record<SeveridadeRisco, string> = {
  BAIXA: 'bg-slate-200 text-slate-700',
  MEDIA: 'bg-amber-50 text-amber-700',
  ALTA: 'bg-orange-50 text-orange-700',
  CRITICA: 'bg-red-50 text-red-700',
};

export function SeveridadeBadge({ severidade }: { severidade: SeveridadeRisco }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SEVERIDADE_STYLES[severidade]}`}
    >
      {severidade}
    </span>
  );
}

const STATUS_FECHAMENTO_FRETE_STYLES: Record<StatusFechamentoFrete, string> = {
  ABERTO: 'bg-slate-200 text-slate-700',
  EM_CONFERENCIA: 'bg-amber-50 text-amber-700',
  APROVADO: 'bg-teal-50 text-teal-700',
  REJEITADO: 'bg-red-50 text-red-700',
  PAGO: 'bg-emerald-50 text-emerald-700',
};

/** Badge do status de fechamento financeiro do frete (Módulo 3, critério #1). */
export function FreteStatusBadge({ status }: { status: StatusFechamentoFrete }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_FECHAMENTO_FRETE_STYLES[status]}`}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}

const TIPO_MANUTENCAO_STYLES: Record<TipoManutencaoVeiculo, string> = {
  PREVENTIVA: 'bg-teal-50 text-teal-700',
  CORRETIVA: 'bg-red-50 text-red-700',
  REVISAO: 'bg-cyan-50 text-cyan-700',
  TROCA_PNEUS: 'bg-amber-50 text-amber-700',
  OUTRO: 'bg-slate-200 text-slate-700',
};

/** Badge do tipo de manutenção de veículo (Módulo 4, Controle de Frota). */
export function ManutencaoTipoBadge({ tipo }: { tipo: TipoManutencaoVeiculo }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TIPO_MANUTENCAO_STYLES[tipo]}`}
    >
      {tipo.replaceAll('_', ' ')}
    </span>
  );
}

const TIPO_EVENTO_JORNADA_STYLES: Record<TipoEventoJornada, string> = {
  INICIO_JORNADA: 'bg-emerald-50 text-emerald-700',
  FIM_JORNADA: 'bg-slate-100 text-slate-500',
  INICIO_DIRECAO: 'bg-blue-50 text-blue-700',
  FIM_DIRECAO: 'bg-blue-50 text-blue-700',
  INICIO_ESPERA: 'bg-amber-50 text-amber-700',
  FIM_ESPERA: 'bg-amber-50 text-amber-700',
  INICIO_DESCANSO: 'bg-purple-50 text-purple-700',
  FIM_DESCANSO: 'bg-purple-50 text-purple-700',
};

/** Badge do tipo de evento de jornada (Módulo 4, Controle de Jornada — ADI 5322). */
export function EventoJornadaBadge({ tipo }: { tipo: TipoEventoJornada }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TIPO_EVENTO_JORNADA_STYLES[tipo]}`}
    >
      {tipo.replaceAll('_', ' ')}
    </span>
  );
}

const STATUS_ENDERECO_STYLES: Record<StatusEnderecoArmazem, string> = {
  LIVRE: 'bg-emerald-50 text-emerald-700',
  OCUPADO: 'bg-blue-50 text-blue-700',
  BLOQUEADO: 'bg-red-50 text-red-700',
};

/** Badge do status de um endereço/bin do armazém (Módulo 5, WMS — mapa de ocupação). */
export function EnderecoStatusBadge({ status }: { status: StatusEnderecoArmazem }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_ENDERECO_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

const STATUS_RECEBIMENTO_STYLES: Record<StatusRecebimento, string> = {
  AGUARDANDO: 'bg-slate-200 text-slate-700',
  EM_CONFERENCIA: 'bg-amber-50 text-amber-700',
  CONFERIDO: 'bg-cyan-50 text-cyan-700',
  ENDERECADO: 'bg-emerald-50 text-emerald-700',
  DIVERGENTE: 'bg-red-50 text-red-700',
};

/** Badge do status de um recebimento (Módulo 5, WMS — Recebimento e Conferência). */
export function RecebimentoStatusBadge({ status }: { status: StatusRecebimento }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_RECEBIMENTO_STYLES[status]}`}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}

const STATUS_EXPEDICAO_STYLES: Record<StatusExpedicao, string> = {
  SOLICITADA: 'bg-slate-200 text-slate-700',
  EM_SEPARACAO: 'bg-amber-50 text-amber-700',
  SEPARADA: 'bg-cyan-50 text-cyan-700',
  EM_REEMBALAGEM: 'bg-indigo-50 text-indigo-700',
  PRONTA_EXPEDICAO: 'bg-teal-50 text-teal-700',
  EXPEDIDA: 'bg-emerald-50 text-emerald-700',
  CANCELADA: 'bg-red-50 text-red-700',
};

/** Badge do status de uma expedição (Módulo 5, WMS — Separação/Reembalagem/Etiquetagem/Cross-docking/Expedição). */
export function ExpedicaoStatusBadge({ status }: { status: StatusExpedicao }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_EXPEDICAO_STYLES[status]}`}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}

const SEVERIDADE_AVARIA_STYLES: Record<SeveridadeAvaria, string> = {
  LEVE: 'bg-amber-50 text-amber-700',
  MODERADA: 'bg-amber-50 text-amber-700',
  GRAVE: 'bg-orange-50 text-orange-700',
  PERDA_TOTAL: 'bg-red-50 text-red-700',
};

/** Badge de severidade de uma avaria (Módulo 5, WMS — Controle de avarias). */
export function AvariaSeveridadeBadge({ severidade }: { severidade: SeveridadeAvaria }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SEVERIDADE_AVARIA_STYLES[severidade]}`}
    >
      {severidade.replaceAll('_', ' ')}
    </span>
  );
}

const STATUS_INVENTARIO_STYLES: Record<StatusInventario, string> = {
  ABERTO: 'bg-slate-200 text-slate-700',
  EM_CONTAGEM: 'bg-amber-50 text-amber-700',
  RECONCILIADO: 'bg-cyan-50 text-cyan-700',
  ENCERRADO: 'bg-emerald-50 text-emerald-700',
};

/** Badge do status de um inventário/contagem física (Módulo 5, WMS — Controle de Inventário). */
export function InventarioStatusBadge({ status }: { status: StatusInventario }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_INVENTARIO_STYLES[status]}`}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}

const STATUS_PORTARIA_ENTRADA_STYLES: Record<StatusPortariaEntrada, string> = {
  AGUARDANDO_CONFERENCIA: 'bg-amber-50 text-amber-700',
  CONFERIDO: 'bg-cyan-50 text-cyan-700',
  LIBERADO_PATIO: 'bg-teal-50 text-teal-700',
  AGUARDANDO_SAIDA: 'bg-indigo-50 text-indigo-700',
  SAIDA_REGISTRADA: 'bg-emerald-50 text-emerald-700',
  CANCELADA: 'bg-red-50 text-red-700',
};

/** Badge do status de uma entrada de portaria (Módulo 8 — Portaria). */
export function PortariaEntradaStatusBadge({ status }: { status: StatusPortariaEntrada }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PORTARIA_ENTRADA_STYLES[status]}`}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}

const STATUS_ORDEM_SERVICO_STYLES: Record<StatusOrdemServico, string> = {
  ABERTA: 'bg-slate-200 text-slate-700',
  EM_EXECUCAO: 'bg-amber-50 text-amber-700',
  FINALIZADA: 'bg-emerald-50 text-emerald-700',
  CANCELADA: 'bg-red-50 text-red-700',
};

/** Badge do status de uma ordem de serviço (Módulo 8 — Portaria, gerada automaticamente na chegada). */
export function OrdemServicoStatusBadge({ status }: { status: StatusOrdemServico }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_ORDEM_SERVICO_STYLES[status]}`}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}

const STATUS_VEICULO_STYLES: Record<StatusOperacionalVeiculo, string> = {
  DISPONIVEL: 'bg-emerald-50 text-emerald-700',
  EM_TRANSITO: 'bg-blue-50 text-blue-700',
  MANUTENCAO: 'bg-amber-50 text-amber-700',
  GARAGEM: 'bg-slate-100 text-slate-700',
};

const STATUS_VEICULO_LABEL: Record<StatusOperacionalVeiculo, string> = {
  DISPONIVEL: 'Disponível',
  EM_TRANSITO: 'Em trânsito',
  MANUTENCAO: 'Manutenção',
  GARAGEM: 'Garagem',
};

/** Badge do estado operacional de um veículo (Módulo 4 — Controle de Frota). */
export function VeiculoStatusBadge({ status }: { status: StatusOperacionalVeiculo }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_VEICULO_STYLES[status]}`}
    >
      {STATUS_VEICULO_LABEL[status]}
    </span>
  );
}

const STATUS_REDE_STYLES: Record<StatusRede, string> = {
  DISPONIVEL: 'bg-emerald-50 text-emerald-700',
  EM_TRANSITO: 'bg-blue-50 text-blue-700',
};

const STATUS_REDE_LABEL: Record<StatusRede, string> = {
  DISPONIVEL: 'Disponível',
  EM_TRANSITO: 'Em trânsito',
};

/** Badge de onde a rede está (pátio x em trânsito) — painel de redes do WMS. */
export function RedeStatusBadge({ status }: { status: StatusRede }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_REDE_STYLES[status]}`}
    >
      {STATUS_REDE_LABEL[status]}
    </span>
  );
}

const CONDICAO_REDE_STYLES: Record<CondicaoUsoRede, string> = {
  NOVA: 'bg-emerald-50 text-emerald-700',
  BOA: 'bg-cyan-50 text-cyan-700',
  REGULAR: 'bg-amber-50 text-amber-700',
  RUIM: 'bg-red-50 text-red-700',
};

/** Badge da condição de uso de uma rede (NOVA/BOA/REGULAR/RUIM). */
export function RedeCondicaoBadge({ condicao }: { condicao: CondicaoUsoRede }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${CONDICAO_REDE_STYLES[condicao]}`}
    >
      {condicao}
    </span>
  );
}

/** Badge do checklist de conferência da rede (concluído x pendente). */
export function RedeChecklistBadge({ concluido }: { concluido: boolean }) {
  return (
    <span
      data-testid="rede-checklist-badge"
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        concluido ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-700'
      }`}
    >
      {concluido ? 'Checklist OK' : 'Checklist pendente'}
    </span>
  );
}
