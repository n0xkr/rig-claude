import type {
  ContarInventarioItemInput,
  CreateInventarioInput,
  Inventario,
  InventarioDetalhe,
} from '@rigabras/shared';
import { TRANSICOES_STATUS_INVENTARIO } from '@rigabras/shared';
import { InventariosRepository, type ListInventariosFilter } from './inventarios.repository.js';
import { EnderecosRepository } from './enderecos.repository.js';
import { EstoqueRepository } from './estoque.repository.js';
import { calcularAjustesInventario } from './estoqueLedger.js';
import { ConflictError, InvalidStateTransitionError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

/**
 * Serviço de Inventário/Contagem (Módulo 5, critério #5): abre uma contagem
 * física snapshotando o saldo ATUAL do ledger (`estoque`) por endereço do
 * armazém, recebe a contagem física item a item e, na reconciliação, gera
 * lançamentos AJUSTE_INVENTARIO no ledger para cada discrepância — nunca
 * edita o saldo materializado diretamente (ver `estoqueLedger.ts`).
 */
export class InventariosService {
  constructor(
    private readonly repo: InventariosRepository = new InventariosRepository(),
    private readonly enderecosRepo: EnderecosRepository = new EnderecosRepository(),
    private readonly estoqueRepo: EstoqueRepository = new EstoqueRepository(),
  ) {}

  list(filter: ListInventariosFilter) {
    return this.repo.list(filter);
  }

  async getById(id: string): Promise<InventarioDetalhe> {
    const inventario = await this.repo.findById(id);
    if (!inventario) throw new NotFoundError('inventario', id);
    const itens = await this.repo.listItens(id);
    return { ...inventario, itens };
  }

  /** Abre um inventário para um armazém, snapshotando o saldo atual (>0) de todos os endereços daquele armazém. */
  async create(
    input: CreateInventarioInput,
    userId: string | null,
    ip: string | null,
  ): Promise<InventarioDetalhe> {
    const armazem = await this.enderecosRepo.findArmazemById(input.armazem_id);
    if (!armazem) throw new NotFoundError('armazem', input.armazem_id);

    const created = await this.repo.create(input, userId);

    const enderecos = await this.enderecosRepo.listAll(input.armazem_id);
    const saldosPorEndereco = await this.estoqueRepo.listSaldosPorEnderecos(
      enderecos.map((e) => e.id),
    );
    const snapshot = saldosPorEndereco.map((saldo) => ({
      produto_id: saldo.produto_id,
      endereco_id: saldo.endereco_id,
      quantidade_sistema: saldo.quantidade,
    }));

    const itens = await this.repo.createItens(created.id, snapshot);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'inventarios',
      entityId: created.id,
      changes: { after: { ...created, itens_count: itens.length } },
      ip,
    });
    return { ...created, itens };
  }

  private assertTransicao(atual: Inventario['status'], proximo: Inventario['status']): void {
    const validos = TRANSICOES_STATUS_INVENTARIO[atual ?? 'ABERTO'];
    if (!validos.includes(proximo!)) {
      throw new InvalidStateTransitionError(atual ?? 'ABERTO', proximo ?? '');
    }
  }

  async iniciarContagem(id: string, userId: string | null, ip: string | null): Promise<Inventario> {
    const inventario = await this.repo.findById(id);
    if (!inventario) throw new NotFoundError('inventario', id);
    this.assertTransicao(inventario.status, 'EM_CONTAGEM');

    const updated = await this.repo.updateIfStatus(id, inventario.status, {
      status: 'EM_CONTAGEM',
    });
    if (!updated)
      throw new ConflictError('O inventário foi alterado por outro usuário; recarregue e tente novamente.');
    await writeAuditLog({
      userId,
      action: 'STATUS_CHANGE',
      entity: 'inventarios',
      entityId: id,
      changes: { before: inventario.status, after: updated.status },
      ip,
    });
    return updated;
  }

  /** Registra a contagem física de um item (produto x endereço) do inventário. */
  async contarItem(
    inventarioId: string,
    input: ContarInventarioItemInput,
    userId: string | null,
    ip: string | null,
  ) {
    const inventario = await this.repo.findById(inventarioId);
    if (!inventario) throw new NotFoundError('inventario', inventarioId);
    if (inventario.status !== 'EM_CONTAGEM') {
      throw new InvalidStateTransitionError(inventario.status ?? 'ABERTO', 'CONTAR_ITEM');
    }

    const itens = await this.repo.listItens(inventarioId);
    const item = itens.find(
      (i) => i.produto_id === input.produto_id && i.endereco_id === input.endereco_id,
    );
    if (!item)
      throw new NotFoundError('inventario_item', `${input.produto_id}/${input.endereco_id}`);

    const updatedItem = await this.repo.updateItem(item.id, {
      quantidade_contada: input.quantidade_contada,
    });
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'inventario_itens',
      entityId: item.id,
      changes: { before: item, after: updatedItem },
      ip,
    });
    return updatedItem;
  }

  /**
   * Reconcilia o inventário: para cada item contado com divergência, gera um
   * lançamento AJUSTE_INVENTARIO no ledger (nunca edita o saldo em
   * silêncio). Restrito a ADMIN/SUPERADMIN na rota (efeito
   * financeiro/contratual sobre o depositante — ver migration 0006).
   */
  async reconciliar(
    id: string,
    userId: string | null,
    ip: string | null,
  ): Promise<InventarioDetalhe> {
    const inventario = await this.repo.findById(id);
    if (!inventario) throw new NotFoundError('inventario', id);
    this.assertTransicao(inventario.status, 'RECONCILIADO');

    const itens = await this.repo.listItens(id);
    if (itens.some((i) => i.quantidade_contada == null)) {
      throw new InvalidStateTransitionError(
        inventario.status ?? 'EM_CONTAGEM',
        'RECONCILIADO (itens pendentes de contagem)',
      );
    }

    const ajustes = calcularAjustesInventario(
      itens.map((i) => ({
        produto_id: i.produto_id,
        endereco_id: i.endereco_id,
        quantidade_sistema: i.quantidade_sistema,
        quantidade_contada: i.quantidade_contada!,
      })),
    );

    for (const ajuste of ajustes) {
      if (ajuste.direcao === 'SEM_AJUSTE') continue;
      const item = itens.find(
        (i) => i.produto_id === ajuste.produto_id && i.endereco_id === ajuste.endereco_id,
      )!;
      await this.estoqueRepo.registrarMovimentacao(
        {
          produto_id: ajuste.produto_id,
          tipo_movimentacao: 'AJUSTE_INVENTARIO',
          quantidade: Math.abs(ajuste.divergencia),
          endereco_origem_id: ajuste.direcao === 'REDUCAO' ? ajuste.endereco_id : undefined,
          endereco_destino_id: ajuste.direcao === 'AUMENTO' ? ajuste.endereco_id : undefined,
          inventario_id: id,
          observacoes: `Ajuste de inventário: sistema=${ajuste.quantidade_sistema}, contado=${ajuste.quantidade_contada}`,
        },
        userId,
      );
      await this.repo.updateItem(item.id, { ajustado: true });
    }

    const updated = await this.repo.updateIfStatus(id, inventario.status, {
      status: 'RECONCILIADO',
    });
    if (!updated)
      throw new ConflictError('O inventário foi alterado por outro usuário; recarregue e tente novamente.');
    await writeAuditLog({
      userId,
      action: 'STATUS_CHANGE',
      entity: 'inventarios',
      entityId: id,
      changes: { before: inventario.status, after: updated.status, ajustes },
      ip,
    });
    const itensAtualizados = await this.repo.listItens(id);
    return { ...updated, itens: itensAtualizados };
  }

  async encerrar(id: string, userId: string | null, ip: string | null): Promise<Inventario> {
    const inventario = await this.repo.findById(id);
    if (!inventario) throw new NotFoundError('inventario', id);
    this.assertTransicao(inventario.status, 'ENCERRADO');

    const updated = await this.repo.updateIfStatus(id, inventario.status, {
      status: 'ENCERRADO',
      data_encerramento: new Date().toISOString(),
    });
    if (!updated)
      throw new ConflictError('O inventário foi alterado por outro usuário; recarregue e tente novamente.');
    await writeAuditLog({
      userId,
      action: 'STATUS_CHANGE',
      entity: 'inventarios',
      entityId: id,
      changes: { before: inventario.status, after: updated.status },
      ip,
    });
    return updated;
  }
}
