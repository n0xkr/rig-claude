import { z } from 'zod';
import {
  FormatoExportacaoSchema,
  StatusFechamentoFreteSchema,
  TipoMovimentacaoEstoqueSchema,
} from '../enums.js';

/**
 * Módulo 7 (Integração ERP) — período e formato de uma exportação. `inicio`
 * e `fim` são datas (YYYY-MM-DD, inclusive) aplicadas sobre a data de
 * referência de cada exportação (frete: `created_at`; estoque: `created_at`
 * da movimentação no ledger).
 */
export const PeriodoExportacaoQuerySchema = z
  .object({
    inicio: z.string().date(),
    fim: z.string().date(),
    formato: FormatoExportacaoSchema.default('json'),
  })
  .refine((data) => data.inicio <= data.fim, {
    message: 'A data de início do período deve ser anterior ou igual à data de fim',
    path: ['fim'],
  });
export type PeriodoExportacaoQuery = z.infer<typeof PeriodoExportacaoQuerySchema>;

/**
 * Registro de exportação financeira (Módulo 7, critério "accounts
 * payable/receivable"): um frete contratado (Módulo 3) com seu saldo
 * calculado, no formato que um módulo financeiro de ERP (SAP, TOTVS,
 * Sankhya, etc. — apenas exemplos, nenhum implementado) esperaria receber.
 */
export const ErpFinanceiroRecordSchema = z.object({
  frete_id: z.string().uuid(),
  viagem_id: z.string().uuid(),
  numero_crt: z.string().nullable(),
  numero_fatura: z.string().nullable(),
  status_fechamento: StatusFechamentoFreteSchema,
  valor_contratado: z.number(),
  total_adiantamentos: z.number(),
  total_descontos: z.number(),
  total_multas: z.number(),
  total_pago_confirmado: z.number(),
  saldo: z.number(),
  data_referencia: z.string(),
});
export type ErpFinanceiroRecord = z.infer<typeof ErpFinanceiroRecordSchema>;

/**
 * Registro de exportação de estoque (Módulo 7, critério "inventory
 * movements"): uma linha do ledger imutável de estoque (Módulo 5), no
 * formato que um módulo de inventário de ERP esperaria receber.
 */
export const ErpEstoqueRecordSchema = z.object({
  movimentacao_id: z.string().uuid(),
  produto_id: z.string().uuid(),
  sku: z.string().nullable(),
  depositante_id: z.string().uuid().nullable(),
  tipo_movimentacao: TipoMovimentacaoEstoqueSchema,
  quantidade: z.number(),
  referencia_documento: z.string().nullable(),
  data_movimentacao: z.string(),
});
export type ErpEstoqueRecord = z.infer<typeof ErpEstoqueRecordSchema>;
