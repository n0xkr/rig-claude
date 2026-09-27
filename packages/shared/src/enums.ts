import { z } from 'zod';

export const UserRoleSchema = z.enum(['SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE']);
export type UserRole = z.infer<typeof UserRoleSchema>;

/**
 * Ciclo de vida operacional da viagem (Módulo 2 — TMS Operacional), estendendo o
 * fluxo original do Módulo 1 (Gerenciamento de Risco) em etapas mais granulares:
 * Programação -> Coleta -> Documentação -> Veículo/Motorista -> Validação ->
 * Viagem -> (Monitoramento/Eventos são transversais, ver módulo eventos_risco) ->
 * Entrega -> Encerramento.
 */
export const StatusViagemSchema = z.enum([
  'PROGRAMADA', // Programação
  'AGUARDANDO_COLETA', // Coleta (agendada, ainda não iniciada)
  'EM_COLETA', // Coleta (em execução)
  'EM_DOCUMENTACAO', // Documentação (CRT/MIC-DTA/Fatura em elaboração/conferência)
  'VEICULO_MOTORISTA_DEFINIDO', // Veículo/Motorista alocados e confirmados
  'EM_VALIDACAO_PRE_EMBARQUE', // Validação (cross-check documental pré-embarque)
  'EM_TRANSITO', // Viagem em rota
  'NA_FRONTEIRA', // Sub-fluxo de travessia de fronteira
  'EM_MONITORAMENTO', // Monitoramento pós-fronteira até a entrega
  'ENTREGUE', // Entrega
  'ENCERRADA', // Encerramento
  'CANCELADA',
]);
export type StatusViagem = z.infer<typeof StatusViagemSchema>;

/** Transições válidas da máquina de estados de uma viagem (critério #1). */
export const TRANSICOES_STATUS_VIAGEM: Record<StatusViagem, StatusViagem[]> = {
  PROGRAMADA: ['AGUARDANDO_COLETA', 'CANCELADA'],
  AGUARDANDO_COLETA: ['EM_COLETA', 'CANCELADA'],
  EM_COLETA: ['EM_DOCUMENTACAO', 'CANCELADA'],
  EM_DOCUMENTACAO: ['VEICULO_MOTORISTA_DEFINIDO', 'CANCELADA'],
  VEICULO_MOTORISTA_DEFINIDO: ['EM_VALIDACAO_PRE_EMBARQUE', 'CANCELADA'],
  EM_VALIDACAO_PRE_EMBARQUE: ['EM_TRANSITO', 'EM_DOCUMENTACAO', 'CANCELADA'],
  EM_TRANSITO: ['NA_FRONTEIRA', 'EM_MONITORAMENTO', 'CANCELADA'],
  NA_FRONTEIRA: ['EM_MONITORAMENTO', 'EM_TRANSITO', 'CANCELADA'],
  EM_MONITORAMENTO: ['ENTREGUE', 'NA_FRONTEIRA', 'CANCELADA'],
  ENTREGUE: ['ENCERRADA'],
  ENCERRADA: [],
  CANCELADA: [],
};

export const SeveridadeRiscoSchema = z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']);
export type SeveridadeRisco = z.infer<typeof SeveridadeRiscoSchema>;

export const StatusEventoRiscoSchema = z.enum(['ABERTO', 'EM_ANALISE', 'MITIGADO', 'ENCERRADO']);
export type StatusEventoRisco = z.infer<typeof StatusEventoRiscoSchema>;

export const TipoApoliceSchema = z.enum(['RCTR_VI', 'RCTR_VI_C']);
export type TipoApolice = z.infer<typeof TipoApoliceSchema>;

export const TipoVeiculoSchema = z.enum([
  'CAVALO',
  'CARRETA_ABERTA',
  'CARRETA_SIDER',
  'CARRETA_OUTRO',
]);
export type TipoVeiculo = z.infer<typeof TipoVeiculoSchema>;

export const PAISES_HABILITADOS = ['AR', 'BO', 'CL', 'PY', 'UY', 'PE'] as const;
export const PaisHabilitadoSchema = z.enum(PAISES_HABILITADOS);
export type PaisHabilitado = z.infer<typeof PaisHabilitadoSchema>;

// ============================================================================
// Módulo 2 — TMS Operacional
// ============================================================================

/** Etapas do fluxo de travessia de fronteira (critério #2 do Módulo 2). */
export const EtapaFronteiraSchema = z.enum([
  'AGENDAMENTO',
  'CHEGADA',
  'GATE',
  'FISCALIZACAO',
  'DESEMBARACO',
  'SAIDA',
  'LIBERACAO',
]);
export type EtapaFronteira = z.infer<typeof EtapaFronteiraSchema>;

/** Ordem cronológica esperada das etapas de fronteira, usada para KPIs. */
export const ORDEM_ETAPAS_FRONTEIRA: EtapaFronteira[] = [
  'AGENDAMENTO',
  'CHEGADA',
  'GATE',
  'FISCALIZACAO',
  'DESEMBARACO',
  'SAIDA',
  'LIBERACAO',
];

export const TipoDocumentoEmbarqueSchema = z.enum(['CRT', 'MIC_DTA', 'FATURA', 'DU_E', 'DUIMP']);
export type TipoDocumentoEmbarque = z.infer<typeof TipoDocumentoEmbarqueSchema>;

/** Severidade de um achado (finding) da validação pré-embarque. */
export const SeveridadeAchadoValidacaoSchema = z.enum(['INFO', 'AVISO', 'BLOQUEANTE']);
export type SeveridadeAchadoValidacao = z.infer<typeof SeveridadeAchadoValidacaoSchema>;

// ============================================================================
// Módulo 3 — Controle Financeiro do Frete
// ============================================================================

/**
 * Máquina de estados explícita do fechamento da viagem (critério #1 do
 * Módulo 3): ABERTO -> EM_CONFERENCIA (conferência operacional) -> APROVADO
 * (aprovação financeira) -> PAGO (pagamento), com REJEITADO como caminho de
 * retrabalho de volta a EM_CONFERENCIA.
 */
export const StatusFechamentoFreteSchema = z.enum([
  'ABERTO',
  'EM_CONFERENCIA',
  'APROVADO',
  'REJEITADO',
  'PAGO',
]);
export type StatusFechamentoFrete = z.infer<typeof StatusFechamentoFreteSchema>;

/** Transições válidas da máquina de estados de fechamento do frete. */
export const TRANSICOES_STATUS_FECHAMENTO_FRETE: Record<
  StatusFechamentoFrete,
  StatusFechamentoFrete[]
> = {
  ABERTO: ['EM_CONFERENCIA'],
  EM_CONFERENCIA: ['APROVADO', 'REJEITADO'],
  APROVADO: ['PAGO', 'REJEITADO'],
  REJEITADO: ['EM_CONFERENCIA'],
  PAGO: [],
};

/**
 * Papéis autorizados a executar cada transição (critério #4 — RBAC). A
 * conferência operacional (ABERTO -> EM_CONFERENCIA, REJEITADO ->
 * EM_CONFERENCIA e o próprio EM_CONFERENCIA -> REJEITADO quando o operador
 * encontra um problema) pode ser feita por OPERADOR; a aprovação financeira
 * (-> APROVADO) e o pagamento (-> PAGO), assim como uma rejeição após
 * aprovação (APROVADO -> REJEITADO), ficam restritos a ADMIN/SUPERADMIN.
 */
export const PAPEIS_TRANSICAO_FECHAMENTO_FRETE: Record<
  StatusFechamentoFrete,
  Partial<Record<StatusFechamentoFrete, UserRole[]>>
> = {
  ABERTO: { EM_CONFERENCIA: ['SUPERADMIN', 'ADMIN', 'OPERADOR'] },
  EM_CONFERENCIA: {
    APROVADO: ['SUPERADMIN', 'ADMIN'],
    REJEITADO: ['SUPERADMIN', 'ADMIN', 'OPERADOR'],
  },
  APROVADO: {
    PAGO: ['SUPERADMIN', 'ADMIN'],
    REJEITADO: ['SUPERADMIN', 'ADMIN'],
  },
  REJEITADO: { EM_CONFERENCIA: ['SUPERADMIN', 'ADMIN', 'OPERADOR'] },
  PAGO: {},
};

/** Tipo de lançamento financeiro que reduz o saldo do frete a receber/pagar. */
export const TipoLancamentoFreteSchema = z.enum(['ADIANTAMENTO', 'DESCONTO', 'MULTA']);
export type TipoLancamentoFrete = z.infer<typeof TipoLancamentoFreteSchema>;

/** Status de um pagamento individual dentro do ledger de pagamentos do frete. */
export const StatusPagamentoFreteSchema = z.enum(['PENDENTE', 'CONFIRMADO', 'CANCELADO']);
export type StatusPagamentoFrete = z.infer<typeof StatusPagamentoFreteSchema>;

// ============================================================================
// Módulo 4 — Controle de Frota e Jornada (foco ADI 5322)
// ============================================================================

export const TipoManutencaoVeiculoSchema = z.enum([
  'PREVENTIVA',
  'CORRETIVA',
  'REVISAO',
  'TROCA_PNEUS',
  'OUTRO',
]);
export type TipoManutencaoVeiculo = z.infer<typeof TipoManutencaoVeiculoSchema>;

/**
 * Tipo de evento no log contínuo de jornada do motorista (critério "Controle
 * de Jornada" — ADI 5322). Cada linha em `registros_jornada` é um evento
 * pontual e imutável; o serviço de conformidade reconstrói as sessões de
 * jornada e os tempos de direção/espera/descanso a partir da sequência
 * ordenada desses eventos por motorista.
 */
export const TipoEventoJornadaSchema = z.enum([
  'INICIO_JORNADA',
  'INICIO_DIRECAO',
  'FIM_DIRECAO',
  'INICIO_ESPERA',
  'FIM_ESPERA',
  'INICIO_DESCANSO',
  'FIM_DESCANSO',
  'FIM_JORNADA',
]);
export type TipoEventoJornada = z.infer<typeof TipoEventoJornadaSchema>;

/**
 * Máquina de estados explícita (critério #1) do log de jornada: dado o
 * último evento em aberto de um motorista, apenas os tipos de evento listados
 * aqui podem ser lançados a seguir (ex: não é possível lançar `FIM_DIRECAO`
 * sem um `INICIO_DIRECAO` pendente; após `FIM_JORNADA`, o único evento válido
 * é um novo `INICIO_JORNADA` — o que, por construção, torna o intervalo entre
 * duas jornadas um período de descanso "puro", nunca interrompido por outro
 * tipo de evento).
 */
export const PROXIMO_EVENTO_JORNADA_VALIDO: Record<TipoEventoJornada, TipoEventoJornada[]> = {
  INICIO_JORNADA: ['INICIO_DIRECAO', 'INICIO_ESPERA', 'INICIO_DESCANSO', 'FIM_JORNADA'],
  INICIO_DIRECAO: ['FIM_DIRECAO'],
  FIM_DIRECAO: ['INICIO_DIRECAO', 'INICIO_ESPERA', 'INICIO_DESCANSO', 'FIM_JORNADA'],
  INICIO_ESPERA: ['FIM_ESPERA'],
  FIM_ESPERA: ['INICIO_DIRECAO', 'INICIO_ESPERA', 'INICIO_DESCANSO', 'FIM_JORNADA'],
  INICIO_DESCANSO: ['FIM_DESCANSO'],
  FIM_DESCANSO: ['INICIO_DIRECAO', 'INICIO_ESPERA', 'INICIO_DESCANSO', 'FIM_JORNADA'],
  FIM_JORNADA: ['INICIO_JORNADA'],
};

// ============================================================================
// Módulo 5 — WMS (Armazém Geral, Decreto 1.102/1903)
// ============================================================================

export const StatusEnderecoArmazemSchema = z.enum(['LIVRE', 'OCUPADO', 'BLOQUEADO']);
export type StatusEnderecoArmazem = z.infer<typeof StatusEnderecoArmazemSchema>;

/**
 * Tipo de evento no ledger imutável de estoque (critério "Inventário deve
 * ser derivado/reconciliado do ledger, nunca um campo mutável solto"). As
 * chaves são estáveis e nunca renomeadas: o futuro Módulo 6 (integração
 * TMS+WMS) referencia 'CROSS_DOCKING' e 'EXPEDICAO' para casar uma expedição
 * do armazém com uma viagem do TMS.
 */
export const TipoMovimentacaoEstoqueSchema = z.enum([
  'RECEBIMENTO',
  'ENDERECAMENTO',
  'SEPARACAO',
  'REEMBALAGEM',
  'ETIQUETAGEM',
  'TRANSFERENCIA',
  'CROSS_DOCKING',
  'EXPEDICAO',
  'AVARIA',
  'AJUSTE_INVENTARIO',
]);
export type TipoMovimentacaoEstoque = z.infer<typeof TipoMovimentacaoEstoqueSchema>;

/** Máquina de estados do recebimento/conferência (critério "Recebimento e Conferência"). */
export const StatusRecebimentoSchema = z.enum([
  'AGUARDANDO',
  'EM_CONFERENCIA',
  'CONFERIDO',
  'ENDERECADO',
  'DIVERGENTE',
]);
export type StatusRecebimento = z.infer<typeof StatusRecebimentoSchema>;

export const TRANSICOES_STATUS_RECEBIMENTO: Record<StatusRecebimento, StatusRecebimento[]> = {
  AGUARDANDO: ['EM_CONFERENCIA'],
  EM_CONFERENCIA: ['CONFERIDO', 'DIVERGENTE'],
  CONFERIDO: ['ENDERECADO'],
  DIVERGENTE: ['EM_CONFERENCIA'],
  ENDERECADO: [],
};

export const TipoExpedicaoSchema = z.enum(['NORMAL', 'CROSS_DOCKING']);
export type TipoExpedicao = z.infer<typeof TipoExpedicaoSchema>;

/**
 * Máquina de estados da expedição (critérios "Separação, Reembalagem,
 * Etiquetagem" e "Cross-docking / Consolidação / Expedição") — etapas
 * estruturadas e timestampadas, mesmo racional do fluxo de fronteira do
 * Módulo 2. Uma expedição CROSS_DOCKING pode pular direto de SOLICITADA para
 * PRONTA_EXPEDICAO (mercadoria roteada direto para expedição, sem
 * endereçamento pleno no armazém).
 */
export const StatusExpedicaoSchema = z.enum([
  'SOLICITADA',
  'EM_SEPARACAO',
  'SEPARADA',
  'EM_REEMBALAGEM',
  'PRONTA_EXPEDICAO',
  'EXPEDIDA',
  'CANCELADA',
]);
export type StatusExpedicao = z.infer<typeof StatusExpedicaoSchema>;

export const TRANSICOES_STATUS_EXPEDICAO: Record<StatusExpedicao, StatusExpedicao[]> = {
  SOLICITADA: ['EM_SEPARACAO', 'PRONTA_EXPEDICAO', 'CANCELADA'], // pula p/ PRONTA_EXPEDICAO em cross-docking
  EM_SEPARACAO: ['SEPARADA', 'CANCELADA'],
  SEPARADA: ['EM_REEMBALAGEM', 'PRONTA_EXPEDICAO', 'CANCELADA'],
  EM_REEMBALAGEM: ['PRONTA_EXPEDICAO', 'CANCELADA'],
  PRONTA_EXPEDICAO: ['EXPEDIDA', 'CANCELADA'],
  EXPEDIDA: [],
  CANCELADA: [],
};

export const SeveridadeAvariaSchema = z.enum(['LEVE', 'MODERADA', 'GRAVE', 'PERDA_TOTAL']);
export type SeveridadeAvaria = z.infer<typeof SeveridadeAvariaSchema>;

/** Máquina de estados do inventário/contagem (critério "Controle de Inventário"). */
export const StatusInventarioSchema = z.enum([
  'ABERTO',
  'EM_CONTAGEM',
  'RECONCILIADO',
  'ENCERRADO',
]);
export type StatusInventario = z.infer<typeof StatusInventarioSchema>;

export const TRANSICOES_STATUS_INVENTARIO: Record<StatusInventario, StatusInventario[]> = {
  ABERTO: ['EM_CONTAGEM'],
  EM_CONTAGEM: ['RECONCILIADO'],
  RECONCILIADO: ['ENCERRADO'],
  ENCERRADO: [],
};
