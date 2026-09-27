import { z } from 'zod';
import { StatusExpedicaoSchema, TipoExpedicaoSchema } from '../enums.js';

/** Item solicitado/separado de uma expedição (Módulo 5, critérios "Separação/Reembalagem/Etiquetagem" e "Cross-docking/Expedição"). */
export const ExpedicaoItemSchema = z.object({
  id: z.string().uuid(),
  expedicao_id: z.string().uuid(),
  produto_id: z.string().uuid(),
  endereco_id: z.string().uuid().nullable().optional(),
  quantidade_solicitada: z.number().nonnegative(),
  quantidade_separada: z.number().nonnegative().nullable().optional(),
  reembalado: z.boolean().optional(),
  etiquetado: z.boolean().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
});
export type ExpedicaoItem = z.infer<typeof ExpedicaoItemSchema>;

export const CreateExpedicaoItemSchema = z.object({
  produto_id: z.string().uuid(),
  quantidade_solicitada: z.number().nonnegative(),
});
export type CreateExpedicaoItemInput = z.infer<typeof CreateExpedicaoItemSchema>;

/** Cabeçalho de uma expedição — solicitação de saída de mercadoria (normal ou cross-docking), com fluxo de separação/reembalagem/etiquetagem até a expedição. `viagem_id` é preenchida pelo futuro Módulo 6 (integração TMS+WMS), nunca por este módulo. */
export const ExpedicaoSchema = z.object({
  id: z.string().uuid(),
  depositante_id: z.string().uuid(),
  viagem_id: z.string().uuid().nullable().optional(),
  referencia_documento: z.string().nullable().optional(),
  tipo: TipoExpedicaoSchema.optional(),
  status: StatusExpedicaoSchema.optional(),
  data_solicitacao: z.string().datetime().optional(),
  data_expedicao: z.string().datetime().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type Expedicao = z.infer<typeof ExpedicaoSchema>;

export const CreateExpedicaoSchema = z.object({
  depositante_id: z.string().uuid(),
  /**
   * Módulo 6 (Integração TMS+WMS): permite já vincular a expedição a uma
   * viagem do TMS no momento da criação. Também pode ser vinculada depois,
   * via `PATCH /wms/expedicoes/:id/vincular-viagem`.
   */
  viagem_id: z.string().uuid().nullable().optional(),
  referencia_documento: z.string().nullable().optional(),
  tipo: TipoExpedicaoSchema.optional(),
  observacoes: z.string().nullable().optional(),
  itens: z.array(CreateExpedicaoItemSchema).min(1),
});
export type CreateExpedicaoInput = z.infer<typeof CreateExpedicaoSchema>;

/** Módulo 6: vincula (ou revincula) uma expedição já criada a uma viagem do TMS. */
export const VincularViagemExpedicaoSchema = z.object({
  viagem_id: z.string().uuid(),
});
export type VincularViagemExpedicaoInput = z.infer<typeof VincularViagemExpedicaoSchema>;

/** Separação de um item da expedição (quantidade separada a partir de um endereço). */
export const SepararExpedicaoItemSchema = z.object({
  quantidade_separada: z.number().nonnegative(),
  endereco_id: z.string().uuid(),
});
export type SepararExpedicaoItemInput = z.infer<typeof SepararExpedicaoItemSchema>;

export const ExpedicaoDetalheSchema = ExpedicaoSchema.extend({
  itens: z.array(ExpedicaoItemSchema),
});
export type ExpedicaoDetalhe = z.infer<typeof ExpedicaoDetalheSchema>;
