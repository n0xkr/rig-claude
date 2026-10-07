import { z } from 'zod';

/**
 * Depositante do Armazém Geral (Módulo 5, Decreto 1.102/1903) — cliente do
 * serviço de guarda/conferência/reembalagem de mercadoria de terceiros.
 * Entidade própria, independente de um eventual cliente de frete rodoviário
 * (Módulos 1-4): ver nota de modelagem #1 na migration 0006.
 */
export const DepositanteSchema = z.object({
  id: z.string().uuid(),
  razao_social: z.string().min(1),
  cnpj_cpf: z.string().min(1),
  contato_nome: z.string().nullable().optional(),
  contato_email: z.string().email().nullable().optional(),
  contato_telefone: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
  observacoes: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type Depositante = z.infer<typeof DepositanteSchema>;

export const CreateDepositanteSchema = DepositanteSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
  created_by: true,
});
export type CreateDepositanteInput = z.infer<typeof CreateDepositanteSchema>;

export const UpdateDepositanteSchema = CreateDepositanteSchema.partial();
export type UpdateDepositanteInput = z.infer<typeof UpdateDepositanteSchema>;
