import type {
  CreateViagemInput,
  UpdateViagemInput,
  UserRole,
  Viagem,
  ViagemCargaInput,
  ViagemWmsStatus,
} from '@rigabras/shared';
import {
  STATUS_VIAGEM_LABEL,
  TRANSICOES_STATUS_VIAGEM,
  type StatusViagem,
} from '@rigabras/shared';
import { ViagensRepository, type ListViagensFilter, type ViagemRow } from './viagens.repository.js';
import { ExpedicoesRepository } from '../wms/expedicoes.repository.js';
import { RecebimentosRepository } from '../wms/recebimentos.repository.js';
import { RecebimentosService } from '../wms/recebimentos.service.js';
import {
  ConflictError,
  DomainError,
  InvalidStateTransitionError,
  NotFoundError,
} from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

/** Papéis que podem corrigir qualquer dado da viagem, inclusive forçar um status fora do fluxo. */
const PAPEIS_ADMIN: UserRole[] = ['SUPERADMIN', 'ADMIN'];

/** Status em que a carga foi descarregada no destino: dispara a automação de recebimento do WMS. */
const STATUS_ENTREGA: StatusViagem[] = ['VAZIO_NO_CLIENTE', 'ENTREGUE'];

/**
 * Consolida os totais da viagem a partir das cargas (CRT/DANFE): documento
 * principal, peso, valor e mercadoria — sem sobrescrever o que o usuário
 * informou explicitamente no próprio payload.
 */
export function totaisDasCargas(
  cargas: ViagemCargaInput[],
  explicito: Partial<Record<'numero_crt' | 'peso_kg' | 'valor_mercadoria' | 'mercadoria' | 'tipo_mercadoria', unknown>>,
): ViagemRow {
  const out: ViagemRow = {};
  if (cargas.length === 0) return out;
  const principal = cargas.find((c) => c.tipo_documento === 'CRT') ?? cargas[0]!;
  if (explicito.numero_crt === undefined) out.numero_crt = principal.numero_documento;
  const pesos = cargas.map((c) => c.peso_kg).filter((p): p is number => typeof p === 'number');
  if (explicito.peso_kg === undefined && pesos.length > 0)
    out.peso_kg = Math.round(pesos.reduce((a, b) => a + b, 0) * 100) / 100;
  const valores = cargas
    .map((c) => c.valor_mercadoria)
    .filter((v): v is number => typeof v === 'number');
  if (explicito.valor_mercadoria === undefined && valores.length > 0)
    out.valor_mercadoria = Math.round(valores.reduce((a, b) => a + b, 0) * 100) / 100;
  const mercadorias = [...new Set(cargas.map((c) => c.mercadoria?.trim()).filter(Boolean))];
  if (explicito.mercadoria === undefined && mercadorias.length > 0)
    out.mercadoria = mercadorias.join(' / ');
  const tipos = [...new Set(cargas.map((c) => c.tipo_mercadoria?.trim()).filter(Boolean))];
  if (explicito.tipo_mercadoria === undefined && tipos.length > 0)
    out.tipo_mercadoria = tipos.join(' / ');
  return out;
}

function normalizarCargas(cargas: ViagemCargaInput[]): ViagemCargaInput[] {
  return cargas
    .map((c) => ({ ...c, numero_documento: c.numero_documento.trim().toUpperCase() }))
    .filter((c) => c.numero_documento !== '');
}

export class ViagensService {
  constructor(
    private readonly repo: ViagensRepository = new ViagensRepository(),
    private readonly expedicoesRepo: ExpedicoesRepository = new ExpedicoesRepository(),
    private readonly recebimentosRepo: RecebimentosRepository = new RecebimentosRepository(),
    private readonly recebimentosService: RecebimentosService = new RecebimentosService(),
  ) {}

  list(filter: ListViagensFilter) {
    return this.repo.list(filter);
  }

  async getById(id: string): Promise<Viagem> {
    const viagem = await this.repo.findById(id);
    if (!viagem) throw new NotFoundError('viagem', id);
    return viagem;
  }

  /** Viagem com as cargas (CRT/DANFE) — usado pela tela de detalhe/edição. */
  async getDetalhe(id: string): Promise<Viagem> {
    const viagem = await this.getById(id);
    const cargas = await this.repo.listCargas(id);
    return { ...viagem, cargas };
  }

  async create(
    rawInput: CreateViagemInput,
    userId: string | null,
    ip: string | null,
  ): Promise<Viagem> {
    const { cargas: cargasBrutas, ...campos } = rawInput;
    const cargas = normalizarCargas(cargasBrutas ?? []);
    // `placa_cavalo` é FK case-sensitive para `veiculos.placa` (sempre maiúscula).
    const row: ViagemRow = {
      ...campos,
      placa_cavalo: campos.placa_cavalo.trim().toUpperCase(),
      ...totaisDasCargas(cargas, campos),
    };
    const numeroCrt = row.numero_crt as string | undefined | null;
    if (numeroCrt) {
      const existing = await this.repo.findByCrt(numeroCrt);
      if (existing) {
        throw new ConflictError(`Já existe uma viagem com o CRT/DANFE ${numeroCrt}`);
      }
    }
    const created = await this.repo.create(row, userId);
    const cargasGravadas = cargas.length > 0 ? await this.repo.replaceCargas(created.id, cargas) : [];
    if (created.motorista_id) {
      await this.repo.insertMotoristaHistorico({
        viagemId: created.id,
        anterior: null,
        novo: created.motorista_id,
        motivo: 'Motorista inicial',
        changedBy: userId,
      });
    }
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'viagens',
      entityId: created.id,
      changes: { after: { ...created, cargas: cargasGravadas } },
      ip,
    });
    return { ...created, cargas: cargasGravadas };
  }

  async update(
    id: string,
    rawInput: UpdateViagemInput,
    userId: string | null,
    ip: string | null,
  ): Promise<Viagem> {
    const { cargas: cargasBrutas, motivo_troca_motorista: motivo, ...campos } = rawInput;
    const before = await this.getDetalhe(id);
    const row: ViagemRow = { ...campos };
    if (campos.placa_cavalo) row.placa_cavalo = campos.placa_cavalo.trim().toUpperCase();

    const trocaMotorista =
      campos.motorista_id !== undefined && campos.motorista_id !== before.motorista_id;
    if (trocaMotorista && before.motorista_id && !motivo) {
      throw new DomainError(
        'Motivo da troca de motorista obrigatório',
        422,
        'Informe por que o motorista desta viagem está sendo trocado (fica registrado no histórico).',
      );
    }
    if (trocaMotorista && campos.motorista_id === null) {
      throw new DomainError('Motorista é obrigatório', 422, 'A viagem precisa ter um motorista.');
    }

    const cargas = cargasBrutas ? normalizarCargas(cargasBrutas) : null;
    if (cargas) Object.assign(row, totaisDasCargas(cargas, campos));
    const novoCrt = row.numero_crt as string | null | undefined;
    if (novoCrt && novoCrt !== before.numero_crt) {
      const existing = await this.repo.findByCrt(novoCrt);
      if (existing && existing.id !== id)
        throw new ConflictError(`Já existe uma viagem com o CRT/DANFE ${novoCrt}`);
    }

    const updated = Object.keys(row).length > 0 ? await this.repo.update(id, row) : before;
    const cargasFinal = cargas ? await this.repo.replaceCargas(id, cargas) : (before.cargas ?? []);
    if (trocaMotorista) {
      await this.repo.insertMotoristaHistorico({
        viagemId: id,
        anterior: before.motorista_id ?? null,
        novo: campos.motorista_id ?? null,
        motivo: motivo ?? (before.motorista_id ? null : 'Motorista inicial'),
        changedBy: userId,
      });
    }
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'viagens',
      entityId: id,
      changes: {
        before,
        after: { ...updated, cargas: cargasFinal },
        ...(trocaMotorista ? { troca_motorista: { motivo: motivo ?? null } } : {}),
      },
      ip,
    });
    return { ...updated, cargas: cargasFinal };
  }

  /** Troca o motorista da viagem, registrando quem era, quem ficou, quando e por quê. */
  trocarMotorista(
    id: string,
    motoristaId: string,
    motivo: string,
    userId: string | null,
    ip: string | null,
  ): Promise<Viagem> {
    return this.update(id, { motorista_id: motoristaId, motivo_troca_motorista: motivo }, userId, ip);
  }

  listMotoristaHistorico(id: string) {
    return this.getById(id).then(() => this.repo.listMotoristaHistorico(id));
  }

  /**
   * Máquina de estados do fluxo operacional (ver `TRANSICOES_STATUS_VIAGEM`):
   * avança para qualquer etapa posterior, volta uma etapa ou cancela.
   * SUPERADMIN/ADMIN podem forçar qualquer status (correção de lançamento).
   * Toda mudança grava uma linha em `status_viagem_historico` e no audit_log.
   */
  async changeStatus(
    id: string,
    nextStatus: StatusViagem,
    userId: string | null,
    ip: string | null,
    observacoes?: string | null,
    role?: UserRole,
  ): Promise<Viagem> {
    const current = await this.getById(id);
    if (current.status === nextStatus) {
      throw new DomainError(
        'Status inalterado',
        422,
        `A viagem já está em "${STATUS_VIAGEM_LABEL[nextStatus]}"`,
      );
    }
    const admin = role !== undefined && PAPEIS_ADMIN.includes(role);
    const allowed = TRANSICOES_STATUS_VIAGEM[current.status] ?? [];
    if (!admin && !allowed.includes(nextStatus)) {
      throw new InvalidStateTransitionError(
        STATUS_VIAGEM_LABEL[current.status],
        STATUS_VIAGEM_LABEL[nextStatus],
      );
    }

    // Só preenche a coluna de data se ainda estiver vazia: voltar a uma etapa
    // já visitada não sobrescreve a data original.
    const timestampField = STATUS_TIMESTAMP_FIELD[nextStatus];
    const patch: ViagemRow = { status: nextStatus };
    if (timestampField && !(current as Record<string, unknown>)[timestampField]) {
      patch[timestampField] = new Date().toISOString();
    }

    const updated = await this.repo.update(id, patch);
    await this.repo.insertStatusHistory({
      viagemId: id,
      statusAnterior: current.status,
      statusNovo: nextStatus,
      changedBy: userId,
      observacoes:
        observacoes ??
        (admin && !allowed.includes(nextStatus) ? 'Status ajustado pelo administrador' : null),
    });
    await writeAuditLog({
      userId,
      action: 'STATUS_CHANGE',
      entity: 'viagens',
      entityId: id,
      changes: { from: current.status, to: nextStatus },
      ip,
    });

    if (STATUS_ENTREGA.includes(nextStatus) && updated.destino_armazem_rigabras) {
      await this.sincronizarRecebimentoAutomatico(updated, userId, ip);
    }

    return updated;
  }

  /**
   * Módulo 6 (Integração TMS+WMS), critério "Entrega -> Recebimento": ao
   * confirmar a descarga de uma viagem com destino ao Armazém Rigabras,
   * tenta criar automaticamente o `recebimento` do Módulo 5 (ver
   * `RecebimentosService.criarAutomaticoDeViagem`). NUNCA bloqueia a
   * mudança de status em si — tanto o sucesso quanto a falha da automação
   * viram uma nota WMS na linha do tempo da viagem.
   */
  private async sincronizarRecebimentoAutomatico(
    viagem: Viagem,
    userId: string | null,
    ip: string | null,
  ): Promise<void> {
    try {
      const recebimento = await this.recebimentosService.criarAutomaticoDeViagem(
        viagem,
        userId,
        ip,
      );
      await this.repo.insertStatusHistory({
        viagemId: viagem.id,
        statusAnterior: viagem.status,
        statusNovo: viagem.status,
        changedBy: userId,
        observacoes: `[WMS] Recebimento ${recebimento.id} criado/localizado automaticamente no armazém a partir desta entrega.`,
        origemEvento: 'WMS',
      });
    } catch (error) {
      if (error instanceof DomainError) {
        await this.repo.insertStatusHistory({
          viagemId: viagem.id,
          statusAnterior: viagem.status,
          statusNovo: viagem.status,
          changedBy: userId,
          observacoes: `[WMS] Não foi possível criar o recebimento automaticamente: ${error.detail ?? error.message}`,
          origemEvento: 'WMS',
        });
        return;
      }
      throw error;
    }
  }

  /**
   * Módulo 6: status cruzado TMS+WMS de uma viagem — expedição e/ou
   * recebimento do armazém vinculados a ela, quando existirem.
   */
  async getWmsStatus(id: string): Promise<ViagemWmsStatus> {
    await this.getById(id);
    const [expedicao, recebimento] = await Promise.all([
      this.expedicoesRepo.findByViagemId(id),
      this.recebimentosRepo.findByViagemId(id),
    ]);
    return { viagem_id: id, expedicao, recebimento };
  }

  /** Histórico de transições de status da viagem (critério #1). */
  async getStatusHistory(id: string) {
    await this.getById(id);
    return this.repo.listStatusHistory(id);
  }

  async softDelete(id: string, userId: string | null, ip: string | null): Promise<void> {
    await this.getById(id);
    await this.repo.softDelete(id);
    await writeAuditLog({
      userId,
      action: 'DELETE',
      entity: 'viagens',
      entityId: id,
      changes: null,
      ip,
    });
  }
}

const STATUS_TIMESTAMP_FIELD: Partial<Record<StatusViagem, string>> = {
  EM_TRANSITO_CLIENTE: 'data_ordem_coleta',
  CARREGADO_AGUARDANDO_DOCUMENTOS: 'data_coleta',
  EM_TRANSITO_FRONTEIRA: 'data_inicio_viagem',
  NA_FRONTEIRA: 'data_chegada_fronteira',
  NA_FRONTEIRA_AGUARDANDO_CRUZE: 'data_chegada_fronteira',
  SAIDA_ADUANA_COTECAR: 'data_liberacao_fronteira',
  VAZIO_NO_CLIENTE: 'data_entrega',
  ENCERRADA: 'data_encerramento',
  // legados
  AGUARDANDO_COLETA: 'data_ordem_coleta',
  EM_COLETA: 'data_coleta',
  EM_TRANSITO: 'data_inicio_viagem',
  EM_MONITORAMENTO: 'data_liberacao_fronteira',
  ENTREGUE: 'data_entrega',
};
