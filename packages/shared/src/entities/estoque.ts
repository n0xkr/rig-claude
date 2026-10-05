import { z } from 'zod';

/**
 * Saldo MATERIALIZADO de estoque (produto x endereço) — NUNCA a fonte da
 * verdade. É recalculado/reconciliado a partir do ledger
 * `movimentacoes_estoque` (ver nota de modelagem na migration 0006).
 */
export const EstoqueSchema = z.object({
  id: z.string().uuid(),
  produto_id: z.string().uuid(),
  endereco_id: z.string().uuid(),
  quantidade: z.number().nonnegative(),
  reconciliado_em: z.string().datetime().nullable().optional(),
  updated_at: z.string().datetime().optional(),
});
export type Estoque = z.infer<typeof EstoqueSchema>;

/** Tipos de movimentação permitidos em lançamento manual (entrada/saída avulsa no armazém). */
export const TIPOS_MOVIMENTACAO_MANUAL = ['ENDERECAMENTO', 'SEPARACAO', 'TRANSFERENCIA'] as const;

/**
 * Movimentação manual de estoque: entrada avulsa (ENDERECAMENTO com destino),
 * saída avulsa (SEPARACAO com origem) ou transferência entre endereços. O
 * documento (nota/romaneio) é obrigatório para manter a rastreabilidade do
 * ledger — nunca se edita saldo sem lançamento.
 */
export const MovimentacaoManualEstoqueSchema = z
  .object({
    tipo: z.enum(TIPOS_MOVIMENTACAO_MANUAL),
    produto_id: z.string().uuid(),
    quantidade: z.number().positive(),
    endereco_origem_id: z.string().uuid().optional(),
    endereco_destino_id: z.string().uuid().optional(),
    documento: z.string().min(1).max(120),
    observacoes: z.string().max(500).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    const precisaOrigem = v.tipo !== 'ENDERECAMENTO';
    const precisaDestino = v.tipo !== 'SEPARACAO';
    if (precisaOrigem && !v.endereco_origem_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endereco_origem_id'],
        message: 'Informe o endereço de origem (saída/transferência)',
      });
    }
    if (precisaDestino && !v.endereco_destino_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endereco_destino_id'],
        message: 'Informe o endereço de destino (entrada/transferência)',
      });
    }
    if (
      v.endereco_origem_id &&
      v.endereco_destino_id &&
      v.endereco_origem_id === v.endereco_destino_id
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endereco_destino_id'],
        message: 'Origem e destino devem ser endereços diferentes',
      });
    }
  });
export type MovimentacaoManualEstoqueInput = z.infer<typeof MovimentacaoManualEstoqueSchema>;

export const SaldoEstoqueSchema = z.object({
  produto_id: z.string().uuid(),
  endereco_id: z.string().uuid(),
  quantidade: z.number().nonnegative(),
  sku: z.string(),
  descricao: z.string(),
  unidade_medida: z.string().nullable().optional(),
  endereco_rotulo: z.string(),
  depositante_id: z.string().uuid(),
  depositante_nome: z.string(),
});
export type SaldoEstoque = z.infer<typeof SaldoEstoqueSchema>;
