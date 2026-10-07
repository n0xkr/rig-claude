import { z } from 'zod';
import { StatusOrdemServicoSchema, TipoOrdemServicoSchema } from '../enums.js';

/** Ordem de serviço operacional, criada automaticamente a partir de uma entrada de portaria (Módulo 8). */
export const OrdemServicoSchema = z.object({
  id: z.string().uuid(),
  tipo: TipoOrdemServicoSchema,
  entrada_portaria_id: z.string().uuid().nullable().optional(),
  viagem_id: z.string().uuid().nullable().optional(),
  status: StatusOrdemServicoSchema.optional(),
  setor_responsavel: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  finalizada_em: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type OrdemServico = z.infer<typeof OrdemServicoSchema>;

export const CreateOrdemServicoSchema = z.object({
  tipo: TipoOrdemServicoSchema,
  entrada_portaria_id: z.string().uuid().nullable().optional(),
  viagem_id: z.string().uuid().nullable().optional(),
  setor_responsavel: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
});
export type CreateOrdemServicoInput = z.infer<typeof CreateOrdemServicoSchema>;

export const AtualizarStatusOrdemServicoSchema = z.object({
  status: StatusOrdemServicoSchema,
  observacoes: z.string().nullable().optional(),
});
export type AtualizarStatusOrdemServicoInput = z.infer<typeof AtualizarStatusOrdemServicoSchema>;
