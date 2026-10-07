import type {
  MovimentacaoManualEstoqueInput,
  MovimentacaoEstoque,
  SaldoEstoque,
  TipoMovimentacaoEstoque,
} from '@rigabras/shared';
import { EstoqueRepository } from './estoque.repository.js';
import { EnderecosRepository } from './enderecos.repository.js';
import { ProdutosRepository } from './produtos.repository.js';
import { DepositantesRepository } from './depositantes.repository.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

export interface ListSaldosFilter {
  armazemId?: string;
  produtoId?: string;
  q?: string;
}

export interface ListMovimentacoesFilter {
  produtoId?: string;
  tipo?: TipoMovimentacaoEstoque;
  limit?: number;
}

const rotuloEndereco = (e: { area: string; rua: string; prateleira: string; posicao: string }) =>
  `${e.area}-${e.rua}-${e.prateleira}-${e.posicao}`;

/**
 * Consulta de saldos e movimentações manuais do armazém: entradas/saídas
 * avulsas fora dos fluxos de recebimento e expedição, sempre via ledger
 * (`movimentacoes_estoque`) — o saldo materializado nunca é editado direto.
 */
export class EstoqueService {
  constructor(
    private readonly estoqueRepo: EstoqueRepository = new EstoqueRepository(),
    private readonly enderecosRepo: EnderecosRepository = new EnderecosRepository(),
    private readonly produtosRepo: ProdutosRepository = new ProdutosRepository(),
    private readonly depositantesRepo: DepositantesRepository = new DepositantesRepository(),
  ) {}

  async listSaldos(filter: ListSaldosFilter): Promise<SaldoEstoque[]> {
    const enderecos = await this.enderecosRepo.listAll(filter.armazemId);
    const porId = new Map(enderecos.map((e) => [e.id, e]));
    const saldos = await this.estoqueRepo.listSaldosPorEnderecos(enderecos.map((e) => e.id));

    const produtoIds = [...new Set(saldos.map((s) => s.produto_id))];
    const produtos = await this.produtosRepo.findByIds(produtoIds);
    const produtoPorId = new Map(produtos.map((p) => [p.id, p]));

    const depositanteIds = [...new Set(produtos.map((p) => p.depositante_id))];
    const depositantes = await Promise.all(
      depositanteIds.map((id) => this.depositantesRepo.findById(id)),
    );
    const depositantePorId = new Map(
      depositantes
        .filter((d): d is NonNullable<typeof d> => d !== null)
        .map((d) => [d.id, d]),
    );

    const termo = filter.q?.trim().toLowerCase();
    const resultado: SaldoEstoque[] = [];
    for (const saldo of saldos) {
      const produto = produtoPorId.get(saldo.produto_id);
      const endereco = porId.get(saldo.endereco_id);
      if (!produto || !endereco) continue;
      const depositante = depositantePorId.get(produto.depositante_id);
      const linha: SaldoEstoque = {
        produto_id: produto.id,
        endereco_id: endereco.id,
        quantidade: saldo.quantidade,
        sku: produto.sku,
        descricao: produto.descricao,
        unidade_medida: produto.unidade_medida ?? null,
        endereco_rotulo: rotuloEndereco(endereco),
        depositante_id: produto.depositante_id,
        depositante_nome: depositante?.razao_social ?? '—',
      };
      if (filter.produtoId && linha.produto_id !== filter.produtoId) continue;
      if (
        termo &&
        !`${linha.sku} ${linha.descricao} ${linha.depositante_nome}`
          .toLowerCase()
          .includes(termo)
      )
        continue;
      resultado.push(linha);
    }
    return resultado.sort(
      (a, b) => a.sku.localeCompare(b.sku) || a.endereco_rotulo.localeCompare(b.endereco_rotulo),
    );
  }

  async movimentarManual(
    input: MovimentacaoManualEstoqueInput,
    userId: string | null,
    ip: string | null,
  ): Promise<MovimentacaoEstoque> {
    const produto = await this.produtosRepo.findById(input.produto_id);
    if (!produto) throw new NotFoundError('produto_armazenado', input.produto_id);
    if (input.endereco_origem_id) {
      const origem = await this.enderecosRepo.findById(input.endereco_origem_id);
      if (!origem) throw new NotFoundError('endereco_armazem', input.endereco_origem_id);
    }
    if (input.endereco_destino_id) {
      const destino = await this.enderecosRepo.findById(input.endereco_destino_id);
      if (!destino) throw new NotFoundError('endereco_armazem', input.endereco_destino_id);
    }
    if (input.tipo === 'SEPARACAO' && input.endereco_origem_id) {
      const saldo = await this.estoqueRepo.getSaldo(input.produto_id, input.endereco_origem_id);
      if (saldo < input.quantidade) {
        throw new ConflictError(
          `Saldo insuficiente no endereço de origem: disponível ${saldo}, solicitado ${input.quantidade}`,
        );
      }
    }

    const movimentacao = await this.estoqueRepo.registrarMovimentacao(
      {
        produto_id: input.produto_id,
        tipo_movimentacao: input.tipo,
        quantidade: input.quantidade,
        endereco_origem_id: input.endereco_origem_id ?? null,
        endereco_destino_id: input.endereco_destino_id ?? null,
        referencia_documento: input.documento,
        observacoes: input.observacoes ?? 'Movimentação manual de estoque',
      },
      userId,
    );

    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'movimentacoes_estoque',
      entityId: movimentacao.id,
      changes: { after: movimentacao },
      ip,
    });
    return movimentacao;
  }

  listMovimentacoes(filter: ListMovimentacoesFilter): Promise<MovimentacaoEstoque[]> {
    return this.estoqueRepo.listMovimentacoesByFilter({
      produtoId: filter.produtoId,
      tipo: filter.tipo,
      periodStart: undefined,
      periodEnd: undefined,
      limit: filter.limit ?? 100,
    });
  }
}
