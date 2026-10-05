import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MovimentacaoEstoque } from '@rigabras/shared';
import { EstoqueService } from './estoque.service.js';
import { EstoqueRepository } from './estoque.repository.js';
import { EnderecosRepository } from './enderecos.repository.js';
import { ProdutosRepository } from './produtos.repository.js';
import { DepositantesRepository } from './depositantes.repository.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';

vi.mock('../../lib/auditLog.js', () => ({ writeAuditLog: vi.fn() }));

const endereco = {
  id: 'e1',
  armazem_id: 'a1',
  area: 'A',
  rua: '01',
  prateleira: '02',
  posicao: '03',
  status: 'OCUPADO',
};

const produto = {
  id: 'p1',
  depositante_id: 'd1',
  sku: 'SKU-1',
  descricao: 'Produto de teste',
  unidade_medida: 'UN',
};

function criarService(overrides: {
  getSaldo?: number;
  listarSaldos?: Array<{ produto_id: string; endereco_id: string; quantidade: number }>;
} = {}) {
  const estoqueRepo = {
    getSaldo: vi.fn().mockResolvedValue(overrides.getSaldo ?? 0),
    registrarMovimentacao: vi.fn().mockResolvedValue({ id: 'm1' }),
    listSaldosPorEnderecos: vi.fn().mockResolvedValue(overrides.listarSaldos ?? []),
    listMovimentacoesByFilter: vi.fn().mockResolvedValue([]),
  };
  const enderecosRepo = {
    listAll: vi.fn().mockResolvedValue([endereco]),
    findById: vi.fn().mockResolvedValue(endereco),
  };
  const produtosRepo = {
    findById: vi.fn().mockResolvedValue(produto),
    findByIds: vi.fn().mockResolvedValue([produto]),
  };
  const depositantesRepo = {
    findById: vi.fn().mockResolvedValue({ id: 'd1', razao_social: 'Depositante X' }),
  };

  const service = new EstoqueService(
    estoqueRepo as unknown as EstoqueRepository,
    enderecosRepo as unknown as EnderecosRepository,
    produtosRepo as unknown as ProdutosRepository,
    depositantesRepo as unknown as DepositantesRepository,
  );

  return { service, estoqueRepo, enderecosRepo, produtosRepo, depositantesRepo };
}

describe('Módulo 5 — EstoqueService (movimentações manuais do armazém)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recusa saída manual com saldo insuficiente no endereço de origem', async () => {
    const { service, estoqueRepo } = criarService({ getSaldo: 5 });

    await expect(
      service.movimentarManual(
        {
          tipo: 'SEPARACAO',
          produto_id: 'p1',
          quantidade: 10,
          endereco_origem_id: 'e1',
          documento: 'ROM-1',
        },
        'u1',
        '127.0.0.1',
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(estoqueRepo.registrarMovimentacao).not.toHaveBeenCalled();
  });

  it('registra a saída quando há saldo suficiente, levando o documento para o ledger', async () => {
    const { service, estoqueRepo } = criarService({ getSaldo: 50 });

    const mov: MovimentacaoEstoque = (await service.movimentarManual(
      {
        tipo: 'SEPARACAO',
        produto_id: 'p1',
        quantidade: 10,
        endereco_origem_id: 'e1',
        documento: 'ROM-1',
      },
      'u1',
      '127.0.0.1',
    )) as MovimentacaoEstoque;

    expect(mov).toEqual({ id: 'm1' });
    expect(estoqueRepo.registrarMovimentacao).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo_movimentacao: 'SEPARACAO',
        quantidade: 10,
        endereco_origem_id: 'e1',
        endereco_destino_id: null,
        referencia_documento: 'ROM-1',
      }),
      'u1',
    );
  });

  it('lança NotFoundError para produto inexistente sem gravar movimentação', async () => {
    const { service, produtosRepo, estoqueRepo } = criarService();
    produtosRepo.findById.mockResolvedValue(null);

    await expect(
      service.movimentarManual(
        {
          tipo: 'ENDERECAMENTO',
          produto_id: 'inexistente',
          quantidade: 1,
          endereco_destino_id: 'e1',
          documento: 'NF-1',
        },
        null,
        null,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(estoqueRepo.registrarMovimentacao).not.toHaveBeenCalled();
  });

  it('lança NotFoundError para endereço de origem inexistente', async () => {
    const { service, enderecosRepo } = criarService();
    enderecosRepo.findById.mockResolvedValue(null);

    await expect(
      service.movimentarManual(
        {
          tipo: 'TRANSFERENCIA',
          produto_id: 'p1',
          quantidade: 1,
          endereco_origem_id: 'e1',
          endereco_destino_id: 'e2',
          documento: 'NF-2',
        },
        null,
        null,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lista saldos enriquecidos com produto/endereço/depositante e aplica filtro de busca', async () => {
    const { service } = criarService({
      listarSaldos: [{ produto_id: 'p1', endereco_id: 'e1', quantidade: 7 }],
    });

    const tudo = await service.listSaldos({});
    expect(tudo).toHaveLength(1);
    expect(tudo[0]).toMatchObject({
      sku: 'SKU-1',
      endereco_rotulo: 'A-01-02-03',
      depositante_nome: 'Depositante X',
      quantidade: 7,
    });

    const filtrado = await service.listSaldos({ q: 'outro-termo' });
    expect(filtrado).toHaveLength(0);
  });

  it('consulta movimentações com limit padrão de 100 registros', async () => {
    const { service, estoqueRepo } = criarService();

    await service.listMovimentacoes({ produtoId: 'p1' });

    expect(estoqueRepo.listMovimentacoesByFilter).toHaveBeenCalledWith(
      expect.objectContaining({ produtoId: 'p1', limit: 100 }),
    );
  });
});
