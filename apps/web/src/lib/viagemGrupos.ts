import { STATUS_VIAGEM_EM_ANDAMENTO, STATUS_VIAGEM_EM_FRONTEIRA } from '@rigabras/shared';

// Parte pura (sem Three.js) para o Painel filtrar viagens sem baixar o chunk 3D.

/** Status em que o caminhão está efetivamente na estrada (fluxo atual + legados equivalentes). */
export const MOVING_STATUS: ReadonlySet<string> = new Set<string>([
  ...STATUS_VIAGEM_EM_ANDAMENTO,
  'EM_COLETA',
  'EM_TRANSITO',
  'EM_MONITORAMENTO',
]);

/** Status de viagens paradas na fronteira/aduanas. */
export const FRONTEIRA_STATUS: ReadonlySet<string> = new Set<string>(STATUS_VIAGEM_EM_FRONTEIRA);

export type GrupoStatus = 'EM_ROTA' | 'FRONTEIRA' | 'PROGRAMADAS' | 'ENCERRADAS';

export const GRUPO_STATUS_LABEL: Record<GrupoStatus, string> = {
  EM_ROTA: 'Em andamento',
  FRONTEIRA: 'Na fronteira / aduanas',
  PROGRAMADAS: 'Programadas',
  ENCERRADAS: 'Encerradas',
};

/** Agrupa o status da viagem para os filtros do painel (mutuamente exclusivo; canceladas ficam de fora). */
export function grupoDoStatus(status: string): GrupoStatus | null {
  if (status === 'CANCELADA') return null;
  if (FRONTEIRA_STATUS.has(status)) return 'FRONTEIRA';
  if (MOVING_STATUS.has(status)) return 'EM_ROTA';
  if (status === 'ENCERRADA' || status === 'ENTREGUE') return 'ENCERRADAS';
  return 'PROGRAMADAS';
}
