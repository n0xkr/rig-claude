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
