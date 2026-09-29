import type {
  CreateProdutoArmazenadoInput,
  ProdutoArmazenado,
  UpdateProdutoArmazenadoInput,
} from '@rigabras/shared';
import { ProdutosRepository, type ListProdutosFilter } from './produtos.repository.js';
import { DepositantesRepository } from './depositantes.repository.js';
import { EstoqueRepository } from './estoque.repository.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

export class ProdutosService {
  constructor(
    private readonly repo: ProdutosRepository = new ProdutosRepository(),
    private readonly depositantesRepo: DepositantesRepository = new DepositantesRepository(),
    private readonly estoqueRepo: EstoqueRepository = new EstoqueRepository(),
  ) {}

  list(filter: ListProdutosFilter) {
    return this.repo.list(filter);
  }

  async getById(id: string): Promise<ProdutoArmazenado> {
    const produto = await this.repo.findById(id);
    if (!produto) throw new NotFoundError('produto_armazenado', id);
    return produto;
  }

  async create(
    input: CreateProdutoArmazenadoInput,
    userId: string | null,
    ip: string | null,
  ): Promise<ProdutoArmazenado> {
    const depositante = await this.depositantesRepo.findById(input.depositante_id);
    if (!depositante) throw new NotFoundError('depositante', input.depositante_id);

    const created = await this.repo.create(input, userId);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'produtos_armazenados',
      entityId: created.id,
      changes: { after: created },
      ip,
    });
    return created;
  }

  async update(
    id: string,
    input: UpdateProdutoArmazenadoInput,
    userId: string | null,
    ip: string | null,
  ): Promise<ProdutoArmazenado> {
    const before = await this.getById(id);
    const updated = await this.repo.update(id, input);
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'produtos_armazenados',
      entityId: id,
      changes: { before, after: updated },
      ip,
    });
    return updated;
  }

  async softDelete(id: string, userId: string | null, ip: string | null): Promise<void> {
    await this.getById(id);
    // Excluir um produto com saldo deixaria estoque "órfão" (e fora do rastreio).
    if ((await this.estoqueRepo.listSaldoTotalPorProduto(id)) > 0) {
      throw new ConflictError('Não é possível excluir um produto que ainda possui estoque');
    }
    await this.repo.softDelete(id);
    await writeAuditLog({
      userId,
      action: 'DELETE',
      entity: 'produtos_armazenados',
      entityId: id,
      changes: null,
      ip,
    });
  }
}
