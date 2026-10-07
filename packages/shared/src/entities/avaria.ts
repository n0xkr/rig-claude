import { z } from 'zod';
import { SeveridadeAvariaSchema } from '../enums.js';

/** Registro de avaria (Módulo 5, critério "Controle de avarias"), ligado a um produto e opcionalmente à movimentação/endereço onde foi constatada. */
export const AvariaSchema = z.object({
  id: z.string().uuid(),
  produto_id: z.string().uuid(),
  movimentacao_id: z.string().uuid().nullable().optional(),
  endereco_id: z.string().uuid().nullable().optional(),
  severidade: SeveridadeAvariaSchema,
  quantidade: z.number().positive(),
  descricao: z.string().min(1),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type Avaria = z.infer<typeof AvariaSchema>;

export const CreateAvariaSchema = AvariaSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
  created_by: true,
});
export type CreateAvariaInput = z.infer<typeof CreateAvariaSchema>;
