import { z } from 'zod';
import { StatusRecebimentoSchema } from '../enums.js';

/** Item esperado/conferido de um recebimento (Módulo 5, critério "Recebimento e Conferência"). */
export const RecebimentoItemSchema = z.object({
  id: z.string().uuid(),
  recebimento_id: z.string().uuid(),
  produto_id: z.string().uuid(),
  quantidade_esperada: z.number().nonnegative(),
  quantidade_conferida: z.number().nonnegative().nullable().optional(),
  endereco_id: z.string().uuid().nullable().optional(),
  divergente: z.boolean().optional(),
  observacoes: z.string().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
});
export type RecebimentoItem = z.infer<typeof RecebimentoItemSchema>;

export const CreateRecebimentoItemSchema = z.object({
  produto_id: z.string().uuid(),
  quantidade_esperada: z.number().nonnegative(),
});
export type CreateRecebimentoItemInput = z.infer<typeof CreateRecebimentoItemSchema>;

/** Cabeçalho de um recebimento — entrada de mercadoria de um depositante, com fluxo de conferência e endereçamento. */
export const RecebimentoSchema = z.object({
  id: z.string().uuid(),
  depositante_id: z.string().uuid(),
  referencia_documento: z.string().nullable().optional(),
  status: StatusRecebimentoSchema.optional(),
  data_prevista: z.string().date().nullable().optional(),
  data_recebimento: z.string().datetime().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type Recebimento = z.infer<typeof RecebimentoSchema>;

export const CreateRecebimentoSchema = z.object({
  depositante_id: z.string().uuid(),
  referencia_documento: z.string().nullable().optional(),
  data_prevista: z.string().date().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  itens: z.array(CreateRecebimentoItemSchema).min(1),
});
export type CreateRecebimentoInput = z.infer<typeof CreateRecebimentoSchema>;

/** Conferência de um item do recebimento (quantidade conferida + endereçamento, critério "Conferência"). */
export const ConferirRecebimentoItemSchema = z.object({
  quantidade_conferida: z.number().nonnegative(),
  endereco_id: z.string().uuid(),
  observacoes: z.string().nullable().optional(),
});
export type ConferirRecebimentoItemInput = z.infer<typeof ConferirRecebimentoItemSchema>;

export const RecebimentoDetalheSchema = RecebimentoSchema.extend({
  itens: z.array(RecebimentoItemSchema),
});
export type RecebimentoDetalhe = z.infer<typeof RecebimentoDetalheSchema>;
