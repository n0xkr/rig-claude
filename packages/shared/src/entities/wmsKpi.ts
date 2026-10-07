import { z } from 'zod';

/**
 * KPIs do Armazém Geral (Módulo 5, critério #6): ocupação (% de endereços
 * ocupados), giro de estoque (turnover — saídas do ledger / saldo médio no
 * período) e um resumo de avarias por severidade.
 */
export const WmsKpiResponseSchema = z.object({
  periodo: z.object({ inicio: z.string().nullable(), fim: z.string().nullable() }),
  ocupacao: z.object({
    total_enderecos: z.number().int().nonnegative(),
    enderecos_ocupados: z.number().int().nonnegative(),
    enderecos_livres: z.number().int().nonnegative(),
    enderecos_bloqueados: z.number().int().nonnegative(),
    percentual_ocupacao: z.number(),
  }),
  giro_estoque: z.object({
    quantidade_expedida_periodo: z.number(),
    saldo_medio_periodo: z.number(),
    giro: z.number().nullable(),
  }),
  avarias_por_severidade: z.record(z.string(), z.number().int().nonnegative()),
  recebimentos_abertos: z.number().int().nonnegative(),
  expedicoes_abertas: z.number().int().nonnegative(),
});
export type WmsKpiResponse = z.infer<typeof WmsKpiResponseSchema>;

/** Um passo da linha do tempo de rastreabilidade (critério "traceability" — histórico de um produto ou de uma movimentação). */
export const RastreioEventoSchema = z.object({
  movimentacao_id: z.string().uuid(),
  tipo_movimentacao: z.string(),
  quantidade: z.number(),
  endereco_origem_id: z.string().uuid().nullable(),
  endereco_destino_id: z.string().uuid().nullable(),
  referencia_documento: z.string().nullable(),
  created_at: z.string(),
});
export type RastreioEvento = z.infer<typeof RastreioEventoSchema>;

export const RastreioProdutoSchema = z.object({
  produto_id: z.string().uuid(),
  saldo_atual_total: z.number(),
  eventos: z.array(RastreioEventoSchema),
});
export type RastreioProduto = z.infer<typeof RastreioProdutoSchema>;
