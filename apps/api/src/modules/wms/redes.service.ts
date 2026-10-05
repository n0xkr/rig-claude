import type {
  CreateRedeInput,
  CreateRedeMovimentacaoInput,
  Rede,
  RedeMovimentacao,
  RedesKpi,
  UpdateRedeInput,
} from '@rigabras/shared';
import {
  RedesRepository,
  type ListRedesFilter,
  type ListRedesMovimentacoesFilter,
} from './redes.repository.js';
import { ConflictError, DomainError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

/** Janela do relatório: validade vencendo nos próximos 30 dias. */
const DIAS_VENCENDO = 30;

function diasAte(data: string): number {
  const alvo = Date.parse(`${data.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(alvo)) return Number.NaN;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje.getTime()) / 86_400_000);
}

/**
 * Serviço das redes de veículos: cadastro com código sequencial RED-######,
 * movimentação (retirada/devolução) com máquina de estados e agregação do
 * relatório em tempo real exibido no painel.
 */
export class RedesService {
  constructor(private readonly repo: RedesRepository = new RedesRepository()) {}

  list(filter: ListRedesFilter) {
    return this.repo.list(filter);
  }

  async getById(id: string): Promise<Rede> {
    const rede = await this.repo.findById(id);
    if (!rede) throw new NotFoundError('rede', id);
    return rede;
  }

  async create(input: CreateRedeInput, userId: string | null, ip: string | null): Promise<Rede> {
    let tentativas = 0;
    for (;;) {
      const codigo = await this.proximoCodigo(tentativas);
      try {
        const created = await this.repo.create({ ...input, codigo }, userId);
        await writeAuditLog({
          userId,
          action: 'CREATE',
          entity: 'redes',
          entityId: created.id,
          changes: { after: created },
          ip,
        });
        return created;
      } catch (error) {
        tentativas += 1;
        const detalhe = error instanceof ConflictError ? (error.detail ?? '') : '';
        const codigoEmUso = detalhe.includes('código') || detalhe.includes('unicidade');
        if (!(error instanceof ConflictError) || !codigoEmUso || tentativas >= 5) throw error;
      }
    }
  }

  private async proximoCodigo(deslocamento: number): Promise<string> {
    const maximo = await this.repo.findMaxCodigo();
    const sequencia = (maximo ? Number(maximo.slice('RED-'.length)) : 0) + 1 + deslocamento;
    if (!Number.isFinite(sequencia) || sequencia <= 0) {
      throw new ConflictError('Não foi possível gerar o código da rede');
    }
    return `RED-${String(sequencia).padStart(6, '0')}`;
  }

  async update(
    id: string,
    input: UpdateRedeInput,
    userId: string | null,
    ip: string | null,
  ): Promise<Rede> {
    const before = await this.getById(id);
    if (Object.keys(input).length === 0) return before;
    const updated = await this.repo.update(id, input);
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'redes',
      entityId: id,
      changes: { before, after: updated },
      ip,
    });
    return updated;
  }

  async softDelete(id: string, userId: string | null, ip: string | null): Promise<void> {
    const rede = await this.getById(id);
    if (rede.status === 'EM_TRANSITO') {
      throw new ConflictError('Não é possível excluir uma rede que está em trânsito');
    }
    await this.repo.softDelete(id);
    await writeAuditLog({
      userId,
      action: 'DELETE',
      entity: 'redes',
      entityId: id,
      changes: null,
      ip,
    });
  }

  /**
   * Retirada (rede sai do pátio para um veículo/cliente) ou devolução (rede
   * volta e fica disponível). O status da rede e o veículo atual são
   * atualizados junto com o registro no histórico, na mesma chamada.
   */
  async movimentar(
    redeId: string,
    input: CreateRedeMovimentacaoInput,
    userId: string | null,
    ip: string | null,
  ): Promise<{ rede: Rede; movimentacao: RedeMovimentacao }> {
    const rede = await this.getById(redeId);

    if (input.tipo === 'RETIRADA') {
      if (rede.status !== 'DISPONIVEL') {
        throw new ConflictError('Esta rede já está em trânsito');
      }
      if (!input.veiculo_id) {
        throw new DomainError('Informe o veículo da retirada', 422, 'veiculo_id é obrigatório');
      }
    } else if (rede.status !== 'EM_TRANSITO') {
      throw new ConflictError('Esta rede não está em trânsito');
    }

    const patch =
      input.tipo === 'RETIRADA'
        ? { status: 'EM_TRANSITO' as const, veiculo_id: input.veiculo_id ?? null }
        : { status: 'DISPONIVEL' as const, veiculo_id: null };
    const atualizada = await this.repo.update(redeId, patch);
    const movimentacao = await this.repo.createMovimentacao(
      {
        ...input,
        veiculo_id: input.tipo === 'DEVOLUCAO' ? (rede.veiculo_id ?? null) : input.veiculo_id,
      },
      userId,
    );
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'rede_movimentacoes',
      entityId: movimentacao.id,
      changes: { before: rede, after: { rede: atualizada, movimentacao } },
      ip,
    });
    return { rede: atualizada, movimentacao };
  }

  listMovimentacoes(filter: ListRedesMovimentacoesFilter) {
    return this.repo.listMovimentacoes(filter);
  }

  /** Relatório em tempo real do painel: contagens derivadas do estado atual. */
  async kpis(): Promise<RedesKpi> {
    const redes = await this.repo.listTodasParaKpis();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let vencendo = 0;
    let vencidas = 0;
    for (const r of redes) {
      if (!r.validade) continue;
      const dias = diasAte(r.validade);
      if (!Number.isFinite(dias)) continue;
      if (dias < 0) vencidas += 1;
      else if (dias <= DIAS_VENCENDO) vencendo += 1;
    }
    return {
      total: redes.length,
      disponiveis: redes.filter((r) => r.status === 'DISPONIVEL').length,
      em_transito: redes.filter((r) => r.status === 'EM_TRANSITO').length,
      vencendo,
      vencidas,
      padrao_cliente: redes.filter((r) => r.padrao_cliente).length,
    };
  }
}
