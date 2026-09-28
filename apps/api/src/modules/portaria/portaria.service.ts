import type {
  CreatePortariaDocumentoInput,
  CreatePortariaEntradaInput,
  CreatePortariaSaidaInput,
  OrdemServico,
  PortariaDocumento,
  PortariaEntrada,
  PortariaEntradaDetalhe,
  PortariaSaida,
  StatusPortariaEntrada,
  UserRole,
  Viagem,
} from '@rigabras/shared';
import { TRANSICOES_STATUS_PORTARIA_ENTRADA } from '@rigabras/shared';
import { PortariaRepository, type ListEntradasFilter } from './portaria.repository.js';
import { writeAuditLog } from '../../lib/auditLog.js';
import { ConflictError, InvalidStateTransitionError, NotFoundError } from '../../lib/errors.js';

/**
 * Serviço do Módulo 8 (Portaria) — o principal gatilho da automação
 * operacional (ver documento de evolução, seções 5-9): registro de entrada
 * -> conferência de documentos -> liberação no pátio -> (se DESCARGA) OS
 * automática -> nota na linha do tempo da viagem -> saída com cálculo do
 * tempo de permanência no pátio.
 */
export class PortariaService {
  constructor(private readonly repo: PortariaRepository = new PortariaRepository()) {}

  listEntradas(filter: ListEntradasFilter) {
    return this.repo.listEntradas(filter);
  }

  async getEntradaDetalhe(id: string): Promise<PortariaEntradaDetalhe> {
    const entrada = await this.repo.findEntradaById(id);
    if (!entrada) throw new NotFoundError('portaria_entrada', id);
    const [documentos, saida] = await Promise.all([
      this.repo.listDocumentos(id),
      this.repo.findSaidaByEntrada(id),
    ]);
    return { ...entrada, documentos, saida };
  }

  /**
   * Registra a chegada do veículo. Se a operação for DESCARGA, cria
   * automaticamente a ordem de serviço vinculada (critério #7 do documento
   * de evolução) e, se a entrada estiver vinculada a uma viagem do TMS,
   * grava uma nota na timeline da viagem em vez de forçar uma transição de
   * status — preserva a máquina de estados de `viagens` intacta.
   */
  async registrarEntrada(
    input: CreatePortariaEntradaInput,
    userId: string | null,
    ip: string | null,
  ): Promise<{ entrada: PortariaEntrada; ordemServico: OrdemServico | null }> {
    const entrada = await this.repo.createEntrada(input, userId);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'portaria_entradas',
      entityId: entrada.id,
      changes: { after: entrada },
      ip,
    });

    let ordemServico: OrdemServico | null = null;
    if ((entrada.tipo_operacao ?? 'DESCARGA') === 'DESCARGA') {
      ordemServico = await this.repo.createOrdemServico(
        {
          tipo: 'DESCARGA',
          entrada_portaria_id: entrada.id,
          viagem_id: entrada.viagem_id ?? null,
          setor_responsavel: 'ARMAZEM',
          observacoes: `OS gerada automaticamente pela chegada do veículo ${entrada.placa_cavalo} na portaria.`,
        },
        userId,
      );
      await writeAuditLog({
        userId,
        action: 'CREATE',
        entity: 'ordens_servico',
        entityId: ordemServico.id,
        changes: { after: ordemServico },
        ip,
      });
    }

    if (entrada.viagem_id) {
      const viagem = await this.repo.findViagemById(entrada.viagem_id);
      if (viagem) {
        await this.repo.registrarNotaTimelineViagem(
          viagem.id,
          viagem.status as Viagem['status'],
          `Veículo ${entrada.placa_cavalo} chegou na portaria${
            ordemServico ? ' — OS de descarga aberta automaticamente' : ''
          }.`,
          userId,
        );
      }
    }

    return { entrada, ordemServico };
  }

  async atualizarStatusEntrada(
    id: string,
    novoStatus: StatusPortariaEntrada,
    observacoes: string | null | undefined,
    userId: string | null,
    ip: string | null,
  ): Promise<PortariaEntrada> {
    const atual = await this.repo.findEntradaById(id);
    if (!atual) throw new NotFoundError('portaria_entrada', id);
    const statusAtual = (atual.status ?? 'AGUARDANDO_CONFERENCIA') as StatusPortariaEntrada;
    const permitidos = TRANSICOES_STATUS_PORTARIA_ENTRADA[statusAtual];
    if (!permitidos.includes(novoStatus)) {
      throw new InvalidStateTransitionError(statusAtual, novoStatus);
    }
    const atualizado = await this.repo.updateEntradaStatus(id, novoStatus, observacoes);
    await writeAuditLog({
      userId,
      action: 'STATUS_CHANGE',
      entity: 'portaria_entradas',
      entityId: id,
      changes: { before: { status: statusAtual }, after: { status: novoStatus } },
      ip,
    });
    return atualizado;
  }

  async anexarDocumento(
    entradaId: string,
    input: CreatePortariaDocumentoInput,
    userId: string | null,
    ip: string | null,
  ): Promise<PortariaDocumento> {
    const entrada = await this.repo.findEntradaById(entradaId);
    if (!entrada) throw new NotFoundError('portaria_entrada', entradaId);
    const documento = await this.repo.createDocumento(entradaId, input, userId);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'portaria_documentos',
      entityId: documento.id,
      changes: { after: documento },
      ip,
    });
    return documento;
  }

  /**
   * Registra a saída da portaria: calcula o tempo total de permanência no
   * pátio, transiciona a entrada para SAIDA_REGISTRADA e, se a descarga foi
   * concluída, finaliza a OS aberta na chegada.
   */
  async registrarSaida(
    entradaId: string,
    input: CreatePortariaSaidaInput,
    userId: string | null,
    ip: string | null,
  ): Promise<{ saida: PortariaSaida; entrada: PortariaEntrada }> {
    const entrada = await this.repo.findEntradaById(entradaId);
    if (!entrada) throw new NotFoundError('portaria_entrada', entradaId);
    const statusAtual = (entrada.status ?? 'AGUARDANDO_CONFERENCIA') as StatusPortariaEntrada;
    if (!TRANSICOES_STATUS_PORTARIA_ENTRADA[statusAtual].includes('SAIDA_REGISTRADA')) {
      throw new InvalidStateTransitionError(statusAtual, 'SAIDA_REGISTRADA');
    }
    const existente = await this.repo.findSaidaByEntrada(entradaId);
    if (existente) {
      throw new ConflictError(`Entrada ${entradaId} já possui saída registrada`);
    }

    const dataEntrada = new Date(entrada.data_entrada ?? entrada.created_at ?? Date.now());
    const dataSaida = new Date();
    const tempoPatioMinutos = Math.max(
      0,
      Math.round((dataSaida.getTime() - dataEntrada.getTime()) / 60000),
    );

    const saida = await this.repo.createSaida(entradaId, input, tempoPatioMinutos, userId);
    const entradaAtualizada = await this.repo.updateEntradaStatus(
      entradaId,
      'SAIDA_REGISTRADA',
      undefined,
    );

    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'portaria_saidas',
      entityId: saida.id,
      changes: { after: saida },
      ip,
    });

    if (input.situacao_descarga === 'FINALIZADA') {
      const ordens = await this.repo.listOrdensServicoByEntrada(entradaId);
      for (const os of ordens) {
        if (os.status !== 'FINALIZADA' && os.status !== 'CANCELADA') {
          await this.repo.updateOrdemServicoStatus(os.id, 'FINALIZADA', 'Encerrada na saída da portaria.');
        }
      }
    }

    if (entrada.viagem_id) {
      const viagem = await this.repo.findViagemById(entrada.viagem_id);
      if (viagem) {
        await this.repo.registrarNotaTimelineViagem(
          viagem.id,
          viagem.status as Viagem['status'],
          `Veículo ${entrada.placa_cavalo} saiu da portaria (permanência: ${tempoPatioMinutos} min).`,
          userId,
        );
      }
    }

    return { saida, entrada: entradaAtualizada };
  }

  /**
   * KPIs simples para o dashboard (critério #4 do documento de evolução):
   * veículos aguardando conferência/descarga, tempo médio de permanência.
   */
  async getKpis(): Promise<{
    aguardandoConferencia: number;
    liberadosNoPatio: number;
    aguardandoSaida: number;
    tempoMedioPatioMinutos: number;
  }> {
    const [aguardandoConferencia, conferidos, liberados, aguardandoSaida] = await Promise.all([
      this.repo.listEntradas({ status: 'AGUARDANDO_CONFERENCIA' }),
      this.repo.listEntradas({ status: 'CONFERIDO' }),
      this.repo.listEntradas({ status: 'LIBERADO_PATIO' }),
      this.repo.listEntradas({ status: 'AGUARDANDO_SAIDA' }),
    ]);
    const saidas = await this.repo.listEntradas({ status: 'SAIDA_REGISTRADA' });
    const tempos: number[] = [];
    for (const entrada of saidas) {
      const saida = await this.repo.findSaidaByEntrada(entrada.id);
      if (saida) tempos.push(saida.tempo_patio_minutos);
    }
    const tempoMedioPatioMinutos = tempos.length
      ? Math.round(tempos.reduce((acc, v) => acc + v, 0) / tempos.length)
      : 0;

    return {
      aguardandoConferencia: aguardandoConferencia.length + conferidos.length,
      liberadosNoPatio: liberados.length,
      aguardandoSaida: aguardandoSaida.length,
      tempoMedioPatioMinutos,
    };
  }
}

export const PAPEIS_PORTARIA_ESCRITA: UserRole[] = ['SUPERADMIN', 'ADMIN', 'OPERADOR', 'PORTARIA'];
