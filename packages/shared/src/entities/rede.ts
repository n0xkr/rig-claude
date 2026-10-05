import { z } from 'zod';
import { CondicaoUsoRedeSchema, StatusRedeSchema, TipoMovimentacaoRedeSchema } from '../enums.js';

/**
 * Rede de carga transportada pela frota (painel "Redes dos veículos" do WMS):
 * cadastro com código próprio (RED-######), condição de uso, validade, marcação
 * de "padrão do cliente" e onde ela está agora (pátio ou em trânsito no
 * veículo). O histórico de retiradas/devoluções vive em `RedeMovimentacao`.
 */
export const RedeSchema = z.object({
  id: z.string().uuid(),
  codigo: z.string().min(1),
  condicao_uso: CondicaoUsoRedeSchema,
  validade: z.string().date().nullable().optional(),
  padrao_cliente: z.boolean().default(false),
  status: StatusRedeSchema.default('DISPONIVEL'),
  veiculo_id: z.string().uuid().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type Rede = z.infer<typeof RedeSchema>;

export const CreateRedeSchema = RedeSchema.omit({
  id: true,
  codigo: true, // gerado no servidor (RED-######)
  status: true, // controlado pelas movimentações
  veiculo_id: true, // idem
  created_by: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});
export type CreateRedeInput = z.infer<typeof CreateRedeSchema>;

export const UpdateRedeSchema = CreateRedeSchema.partial();
export type UpdateRedeInput = z.infer<typeof UpdateRedeSchema>;

/**
 * Retirada/devolução de uma rede: registra quando ela saiu (e para qual
 * cliente/veículo) e quando voltou — o relatório "em tempo real" do painel é
 * a leitura combinada de `redes` + este histórico.
 */
export const RedeMovimentacaoSchema = z.object({
  id: z.string().uuid(),
  rede_id: z.string().uuid(),
  tipo: TipoMovimentacaoRedeSchema,
  veiculo_id: z.string().uuid().nullable().optional(),
  cliente: z.string().min(1),
  motorista_id: z.string().uuid().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
});
export type RedeMovimentacao = z.infer<typeof RedeMovimentacaoSchema>;

export const CreateRedeMovimentacaoSchema = RedeMovimentacaoSchema.omit({
  id: true,
  created_by: true,
  created_at: true,
}).extend({
  observacoes: z.string().max(2000).nullable().optional(),
});
export type CreateRedeMovimentacaoInput = z.infer<typeof CreateRedeMovimentacaoSchema>;

/** Painel de redes: contagens do relatório em tempo real. */
export const RedesKpiSchema = z.object({
  total: z.number().int().nonnegative(),
  disponiveis: z.number().int().nonnegative(),
  em_transito: z.number().int().nonnegative(),
  vencendo: z.number().int().nonnegative(),
  vencidas: z.number().int().nonnegative(),
  padrao_cliente: z.number().int().nonnegative(),
});
export type RedesKpi = z.infer<typeof RedesKpiSchema>;
