import { z } from 'zod';

export const UserRoleSchema = z.enum(['SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const StatusViagemSchema = z.enum([
  'PROGRAMADA',
  'EM_COLETA',
  'EM_TRANSITO',
  'NA_FRONTEIRA',
  'ENTREGUE',
  'ENCERRADA',
  'CANCELADA',
]);
export type StatusViagem = z.infer<typeof StatusViagemSchema>;

/** Transições válidas da máquina de estados de uma viagem (critério #1). */
export const TRANSICOES_STATUS_VIAGEM: Record<StatusViagem, StatusViagem[]> = {
  PROGRAMADA: ['EM_COLETA', 'CANCELADA'],
  EM_COLETA: ['EM_TRANSITO', 'CANCELADA'],
  EM_TRANSITO: ['NA_FRONTEIRA', 'CANCELADA'],
  NA_FRONTEIRA: ['ENTREGUE', 'EM_TRANSITO', 'CANCELADA'],
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
