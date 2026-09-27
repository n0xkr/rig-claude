import type {
  StatusViagem,
  SeveridadeRisco,
  StatusFechamentoFrete,
  TipoManutencaoVeiculo,
  TipoEventoJornada,
} from '@rigabras/shared';

const STATUS_STYLES: Record<StatusViagem, string> = {
  PROGRAMADA: 'bg-slate-700 text-slate-200',
  AGUARDANDO_COLETA: 'bg-amber-950/60 text-amber-300',
  EM_COLETA: 'bg-amber-900/60 text-amber-200',
  EM_DOCUMENTACAO: 'bg-cyan-900/60 text-cyan-200',
  VEICULO_MOTORISTA_DEFINIDO: 'bg-teal-900/60 text-teal-200',
  EM_VALIDACAO_PRE_EMBARQUE: 'bg-indigo-900/60 text-indigo-200',
  EM_TRANSITO: 'bg-blue-900/60 text-blue-200',
  NA_FRONTEIRA: 'bg-purple-900/60 text-purple-200',
  EM_MONITORAMENTO: 'bg-sky-900/60 text-sky-200',
  ENTREGUE: 'bg-emerald-900/60 text-emerald-200',
  ENCERRADA: 'bg-slate-800 text-slate-400',
  CANCELADA: 'bg-red-900/60 text-red-200',
};

export function StatusBadge({ status }: { status: StatusViagem }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}

const SEVERIDADE_STYLES: Record<SeveridadeRisco, string> = {
  BAIXA: 'bg-slate-700 text-slate-200',
  MEDIA: 'bg-amber-900/60 text-amber-200',
  ALTA: 'bg-orange-900/60 text-orange-200',
  CRITICA: 'bg-red-900/60 text-red-200',
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
  ABERTO: 'bg-slate-700 text-slate-200',
  EM_CONFERENCIA: 'bg-amber-900/60 text-amber-200',
  APROVADO: 'bg-teal-900/60 text-teal-200',
  REJEITADO: 'bg-red-900/60 text-red-200',
  PAGO: 'bg-emerald-900/60 text-emerald-200',
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
  PREVENTIVA: 'bg-teal-900/60 text-teal-200',
  CORRETIVA: 'bg-red-900/60 text-red-200',
  REVISAO: 'bg-cyan-900/60 text-cyan-200',
  TROCA_PNEUS: 'bg-amber-900/60 text-amber-200',
  OUTRO: 'bg-slate-700 text-slate-200',
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
  INICIO_JORNADA: 'bg-emerald-900/60 text-emerald-200',
  FIM_JORNADA: 'bg-slate-800 text-slate-400',
  INICIO_DIRECAO: 'bg-blue-900/60 text-blue-200',
  FIM_DIRECAO: 'bg-blue-950/60 text-blue-300',
  INICIO_ESPERA: 'bg-amber-900/60 text-amber-200',
  FIM_ESPERA: 'bg-amber-950/60 text-amber-300',
  INICIO_DESCANSO: 'bg-purple-900/60 text-purple-200',
  FIM_DESCANSO: 'bg-purple-950/60 text-purple-300',
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
