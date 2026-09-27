import { z } from 'zod';
import { PaisHabilitadoSchema, StatusViagemSchema } from '../enums.js';

export const ViagemSchema = z.object({
  id: z.string().uuid(),
  numero_crt: z.string().nullable().optional(),
  numero_mic_dta: z.string().nullable().optional(),
  placa_cavalo: z.string().min(6).max(8),
  veiculo_id: z.string().uuid().nullable().optional(),
  motorista_id: z.string().uuid().nullable().optional(),
  status: StatusViagemSchema.default('PROGRAMADA'),
  origem: z.string().min(2),
  destino: z.string().min(2),
  pais_destino: PaisHabilitadoSchema.nullable().optional(),
  data_programacao: z.string().datetime().optional(),
  data_ordem_coleta: z.string().datetime().nullable().optional(),
  data_coleta: z.string().datetime().nullable().optional(),
  data_inicio_viagem: z.string().datetime().nullable().optional(),
  data_chegada_fronteira: z.string().datetime().nullable().optional(),
  data_liberacao_fronteira: z.string().datetime().nullable().optional(),
  data_entrega: z.string().datetime().nullable().optional(),
  data_encerramento: z.string().datetime().nullable().optional(),
  peso_kg: z.number().nonnegative().nullable().optional(),
  valor_frete: z.number().nonnegative().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  /**
   * Módulo 6 (Integração TMS+WMS): sinaliza que o destino final desta
   * viagem é o Armazém Geral da Rigabras (e não um cliente externo),
   * habilitando a criação automática de um `recebimento` do Módulo 5
   * quando a viagem for marcada como ENTREGUE.
   */
  destino_armazem_rigabras: z.boolean().optional(),
  /**
   * Módulo 6: depositante (Módulo 5) dono da carga transportada nesta
   * viagem — necessário para a automação de recebimento acima. Sem este
   * campo preenchido, a automação não é bloqueante: apenas registra uma
   * nota WMS explicando por que o recebimento não pôde ser criado.
   */
  depositante_id: z.string().uuid().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type Viagem = z.infer<typeof ViagemSchema>;

export const CreateViagemSchema = ViagemSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
  created_by: true,
});
export type CreateViagemInput = z.infer<typeof CreateViagemSchema>;

export const UpdateViagemSchema = CreateViagemSchema.partial();
export type UpdateViagemInput = z.infer<typeof UpdateViagemSchema>;

export const ChangeStatusViagemSchema = z.object({
  status: StatusViagemSchema,
  observacoes: z.string().nullable().optional(),
});
export type ChangeStatusViagemInput = z.infer<typeof ChangeStatusViagemSchema>;
