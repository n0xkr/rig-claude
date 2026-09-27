import type { Avaria, CreateAvariaInput } from '@rigabras/shared';
import { AvariasRepository, type ListAvariasFilter } from './avarias.repository.js';
import { ProdutosRepository } from './produtos.repository.js';
import { EstoqueRepository } from './estoque.repository.js';
import { NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

/** Serviço de Controle de Avarias (Módulo 5, critério #5): cada avaria registrada gera uma movimentação AVARIA no ledger (baixa do saldo no endereço afetado, quando informado), nunca apenas um registro solto sem efeito no estoque. */
export class AvariasService {
  constructor(
    private readonly repo: AvariasRepository = new AvariasRepository(),
    private readonly produtosRepo: ProdutosRepository = new ProdutosRepository(),
    private readonly estoqueRepo: EstoqueRepository = new EstoqueRepository(),
  ) {}

  list(filter: ListAvariasFilter) {
    return this.repo.list(filter);
  }

  async getById(id: string): Promise<Avaria> {
    const avaria = await this.repo.findById(id);
    if (!avaria) throw new NotFoundError('avaria', id);
    return avaria;
  }

  async create(
    input: CreateAvariaInput,
    userId: string | null,
    ip: string | null,
  ): Promise<Avaria> {
    const produto = await this.produtosRepo.findById(input.produto_id);
    if (!produto) throw new NotFoundError('produto_armazenado', input.produto_id);

    let movimentacaoId: string | null = null;
    if (input.endereco_id) {
      const movimentacao = await this.estoqueRepo.registrarMovimentacao(
        {
          produto_id: input.produto_id,
          tipo_movimentacao: 'AVARIA',
          quantidade: input.quantidade,
          endereco_origem_id: input.endereco_id,
        },
        userId,
      );
      movimentacaoId = movimentacao.id;
    }

    const created = await this.repo.create({ ...input, movimentacao_id: movimentacaoId }, userId);
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'avarias',
      entityId: created.id,
      changes: { after: created },
      ip,
    });
    return created;
  }
}
