import type {
  CreateEventoFronteiraInput,
  EventoFronteira,
  FronteiraKpiResponse,
  FronteiraKpiRota,
  FronteiraKpiViagem,
  Viagem,
} from '@rigabras/shared';
import { ORDEM_ETAPAS_FRONTEIRA } from '@rigabras/shared';
import { FronteiraRepository, type FronteiraKpiFilter } from './fronteira.repository.js';
import { writeAuditLog } from '../../lib/auditLog.js';

/**
 * Serviço de KPIs e registro de etapas de travessia de fronteira
 * (Módulo 2, critério #2): Agendamento -> Chegada -> Gate -> Fiscalização ->
 * Desembaraço -> Saída -> Liberação, cada etapa timestampada para permitir o
 * cálculo de tempo parado, tempo de desembaraço, retenção, retrabalho
 * documental, motivo da retenção, custo estimado da espera, performance por
 * viagem e performance por rota.
 */
export class FronteiraService {
  constructor(private readonly repo: FronteiraRepository = new FronteiraRepository()) {}

  listByViagem(viagemId: string): Promise<EventoFronteira[]> {
    return this.repo.listByViagem(viagemId);
  }

  async registrarEtapa(
    input: CreateEventoFronteiraInput,
    userId: string | null,
    ip: string | null,
  ): Promise<EventoFronteira> {
    const created = await this.repo.create(input, userId);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'eventos_fronteira',
      entityId: created.id,
      changes: { after: created },
      ip,
    });
    return created;
  }

  /**
   * Agrega os eventos de fronteira em KPIs por viagem e por rota. Como este
   * scaffold não assume um data warehouse próprio, a agregação é feita em
   * memória a partir da listagem bruta de eventos (aceitável no volume
   * esperado de eventos de fronteira por viagem).
   */
  async getKpis(filter: FronteiraKpiFilter): Promise<FronteiraKpiResponse> {
    const eventos = await this.repo.listEventosParaKpis(filter);

    const porViagemMap = new Map<string, Array<EventoFronteira & { viagem: Viagem | null }>>();
    for (const evento of eventos) {
      const list = porViagemMap.get(evento.viagem_id) ?? [];
      list.push(evento);
      porViagemMap.set(evento.viagem_id, list);
    }

    const porViagem: FronteiraKpiViagem[] = [];
    for (const [viagemId, viagemEventos] of porViagemMap) {
      const viagem = viagemEventos[0]?.viagem ?? null;
      if (filter.rota && `${viagem?.origem} -> ${viagem?.destino}` !== filter.rota) continue;
      const tempoParadoTotal = sum(viagemEventos.map((e) => e.tempo_parado_minutos ?? 0));
      const custoTotal = sum(viagemEventos.map((e) => e.custo_estimado_espera ?? 0));
      const retencoes = viagemEventos.filter((e) => (e.tempo_parado_minutos ?? 0) > 0).length;
      const retrabalho = viagemEventos.filter((e) => e.retrabalho_documental).length;
      const motivos = Array.from(
        new Set(viagemEventos.map((e) => e.motivo_retencao).filter((m): m is string => !!m)),
      );

      const chegada = findEtapa(viagemEventos, 'CHEGADA');
      const desembaraco = findEtapa(viagemEventos, 'DESEMBARACO');
      const liberacao = findEtapa(viagemEventos, 'LIBERACAO');

      porViagem.push({
        viagem_id: viagemId,
        numero_crt: viagem?.numero_crt ?? null,
        placa_cavalo: viagem?.placa_cavalo ?? '-',
        etapas_registradas: viagemEventos.length,
        tempo_parado_total_minutos: tempoParadoTotal,
        tempo_desembaraco_minutos: minutesBetween(chegada, desembaraco),
        tempo_total_fronteira_minutos: minutesBetween(chegada, liberacao),
        qtd_retencoes: retencoes,
        qtd_retrabalho_documental: retrabalho,
        custo_estimado_espera_total: custoTotal,
        motivos_retencao: motivos,
      });
    }

    const porRotaMap = new Map<string, FronteiraKpiViagem[]>();
    const paisPorRota = new Map<string, string | null>();
    for (const [, viagemEventos] of porViagemMap) {
      const viagem = viagemEventos[0]?.viagem ?? null;
      if (!viagem) continue;
      const rotaKey = `${viagem.origem} -> ${viagem.destino}`;
      if (filter.rota && rotaKey !== filter.rota) continue;
      const list = porRotaMap.get(rotaKey) ?? [];
      const kpiViagem = porViagem.find((v) => v.viagem_id === viagemEventos[0]!.viagem_id);
      if (kpiViagem) list.push(kpiViagem);
      porRotaMap.set(rotaKey, list);
      paisPorRota.set(rotaKey, viagem.pais_destino ?? null);
    }

    const porRota: FronteiraKpiRota[] = Array.from(porRotaMap.entries()).map(([rota, viagens]) => ({
      rota,
      pais_destino: paisPorRota.get(rota) ?? null,
      qtd_viagens: viagens.length,
      tempo_parado_medio_minutos: average(viagens.map((v) => v.tempo_parado_total_minutos)),
      tempo_desembaraco_medio_minutos: average(
        viagens.map((v) => v.tempo_desembaraco_minutos ?? 0),
      ),
      custo_estimado_espera_total: sum(viagens.map((v) => v.custo_estimado_espera_total)),
    }));

    return { porViagem, porRota };
  }
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((sum(values) / values.length) * 100) / 100;
}

function findEtapa(
  eventos: EventoFronteira[],
  etapa: (typeof ORDEM_ETAPAS_FRONTEIRA)[number],
): EventoFronteira | undefined {
  return eventos.find((e) => e.etapa === etapa);
}

function minutesBetween(start?: EventoFronteira, end?: EventoFronteira): number | null {
  if (!start?.timestamp_etapa || !end?.timestamp_etapa) return null;
  const diffMs =
    new Date(end.timestamp_etapa).getTime() - new Date(start.timestamp_etapa).getTime();
  if (diffMs < 0) return null;
  return Math.round(diffMs / 60000);
}
