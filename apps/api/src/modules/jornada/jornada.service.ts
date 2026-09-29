import type {
  AlertaConformidadeMotorista,
  CreateRegistroJornadaInput,
  HistoricoJornadaMotorista,
  RegistroJornada,
  TipoEventoJornada,
} from '@rigabras/shared';
import { PROXIMO_EVENTO_JORNADA_VALIDO } from '@rigabras/shared';
import { JornadaRepository, type ListEventosFilter } from './jornada.repository.js';
import { MotoristasRepository } from '../motoristas/motoristas.repository.js';
import { ViagensRepository } from '../viagens/viagens.repository.js';
import { avaliarSessao, construirSessoesJornada } from './jornadaCompliance.js';
import { InvalidStateTransitionError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

const JANELA_ALERTAS_DIAS_PADRAO = 7;

/**
 * Serviço de Controle de Jornada (Módulo 4, parte B — foco ADI 5322):
 * registro de eventos (com validação da máquina de estados explícita,
 * critério #1), histórico consolidado por motorista (exportável, critério
 * "reduzir a exposição trabalhista") e painel de alertas de conformidade
 * entre motoristas ativos. O cálculo em si (sessões, tempos, achados) é
 * delegado a `jornadaCompliance.ts` (funções puras, testáveis isoladamente).
 */
export class JornadaService {
  constructor(
    private readonly repo: JornadaRepository = new JornadaRepository(),
    private readonly motoristasRepo: MotoristasRepository = new MotoristasRepository(),
    private readonly viagensRepo: ViagensRepository = new ViagensRepository(),
  ) {}

  async registrarEvento(
    input: CreateRegistroJornadaInput,
    userId: string | null,
    ip: string | null,
  ): Promise<RegistroJornada> {
    const motorista = await this.motoristasRepo.findById(input.motorista_id);
    if (!motorista) throw new NotFoundError('motorista', input.motorista_id);
    // registros_jornada.viagem_id tem FK para viagens: valida antes para responder 404 em vez de 500 (23503).
    if (input.viagem_id) {
      const viagem = await this.viagensRepo.findById(input.viagem_id);
      if (!viagem) throw new NotFoundError('viagem', input.viagem_id);
    }

    const ultimoEvento = await this.repo.findUltimoEventoByMotorista(input.motorista_id);
    const proximosValidos: TipoEventoJornada[] = ultimoEvento
      ? PROXIMO_EVENTO_JORNADA_VALIDO[ultimoEvento.tipo_evento]
      : ['INICIO_JORNADA'];
    if (!proximosValidos.includes(input.tipo_evento)) {
      throw new InvalidStateTransitionError(
        ultimoEvento?.tipo_evento ?? 'NENHUM_EVENTO_ANTERIOR',
        input.tipo_evento,
      );
    }

    const created = await this.repo.create(input, userId);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'registros_jornada',
      entityId: created.id,
      changes: { after: created },
      ip,
    });
    return created;
  }

  async softDeleteEvento(id: string, userId: string | null, ip: string | null): Promise<void> {
    const evento = await this.repo.findById(id);
    if (!evento) throw new NotFoundError('registro_jornada', id);
    await this.repo.softDelete(id);
    await writeAuditLog({
      userId,
      action: 'DELETE',
      entity: 'registros_jornada',
      entityId: id,
      changes: null,
      ip,
    });
  }

  async listEventosByMotorista(
    motoristaId: string,
    filter: ListEventosFilter = {},
  ): Promise<RegistroJornada[]> {
    const motorista = await this.motoristasRepo.findById(motoristaId);
    if (!motorista) throw new NotFoundError('motorista', motoristaId);
    return this.repo.listByMotorista(motoristaId, filter);
  }

  /** Histórico consolidado de um motorista — sessões + achados de conformidade, pronto para export em JSON ou CSV. */
  async getHistorico(
    motoristaId: string,
    filter: ListEventosFilter = {},
  ): Promise<HistoricoJornadaMotorista> {
    const motorista = await this.motoristasRepo.findById(motoristaId);
    if (!motorista) throw new NotFoundError('motorista', motoristaId);

    const eventos = await this.repo.listByMotorista(motoristaId, filter);
    const sessoes = construirSessoesJornada(eventos).map((sessao) => ({
      ...sessao,
      achados: avaliarSessao(sessao),
    }));

    return {
      motorista_id: motoristaId,
      motorista_nome: motorista.nome_completo,
      periodo: { inicio: filter.periodStart ?? null, fim: filter.periodEnd ?? null },
      sessoes,
      gerado_em: new Date().toISOString(),
    };
  }

  /**
   * Painel de alertas: motoristas ATIVOS cuja janela recente de eventos
   * (últimos `janelaDias`, padrão 7) produz ao menos um achado de severidade
   * AVISO ou BLOQUEANTE — critério "identificação de excessos e alertas
   * imediatos para situações de risco".
   */
  async getAlertas(
    janelaDias: number = JANELA_ALERTAS_DIAS_PADRAO,
  ): Promise<AlertaConformidadeMotorista[]> {
    const motoristas = await this.repo.listMotoristaIdsAtivos();
    if (motoristas.length === 0) return [];

    const desde = new Date(Date.now() - janelaDias * 24 * 60 * 60 * 1000).toISOString();
    const eventos = await this.repo.listEventosPorMotoristas(
      motoristas.map((m) => m.id),
      desde,
    );

    const eventosPorMotorista = new Map<string, RegistroJornada[]>();
    for (const evento of eventos) {
      const lista = eventosPorMotorista.get(evento.motorista_id) ?? [];
      lista.push(evento);
      eventosPorMotorista.set(evento.motorista_id, lista);
    }

    const alertas: AlertaConformidadeMotorista[] = [];
    for (const motorista of motoristas) {
      const eventosDaJanela = eventosPorMotorista.get(motorista.id) ?? [];
      // A janela pode começar no meio de uma jornada: descarta eventos anteriores ao primeiro INICIO_JORNADA
      // para não gerar o falso achado "sessão sem INICIO_JORNADA".
      const primeiroInicio = eventosDaJanela.findIndex((e) => e.tipo_evento === 'INICIO_JORNADA');
      if (primeiroInicio === -1) continue;
      const eventosMotorista = eventosDaJanela.slice(primeiroInicio);

      const sessoes = construirSessoesJornada(eventosMotorista);
      const achadosDeRisco = sessoes
        .flatMap((sessao) => avaliarSessao(sessao))
        .filter((achado) => achado.severidade !== 'INFO');
      if (achadosDeRisco.length === 0) continue;

      alertas.push({
        motorista_id: motorista.id,
        motorista_nome: motorista.nome_completo,
        sessao_aberta: sessoes.some((s) => s.aberta),
        achados: achadosDeRisco,
      });
    }
    return alertas;
  }
}
