import { z } from "zod";
import { SeveridadeRiscoSchema, StatusEventoRiscoSchema } from "../enums.js";

export const EventoRiscoSchema = z.object({
  id: z.string().uuid(),
  viagem_id: z.string().uuid(),
  tipo: z.string().min(2).max(100),
  severidade: SeveridadeRiscoSchema.default("BAIXA"),
  descricao: z.string().min(3),
  status: StatusEventoRiscoSchema.default("ABERTO"),
  origem_deteccao: z.string().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  metadata_json: z.record(z.unknown()).nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type EventoRisco = z.infer<typeof EventoRiscoSchema>;

export const CreateEventoRiscoSchema = EventoRiscoSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
  created_by: true,
});
export type CreateEventoRiscoInput = z.infer<typeof CreateEventoRiscoSchema>;

export const UpdateEventoRiscoSchema = CreateEventoRiscoSchema.partial();
export type UpdateEventoRiscoInput = z.infer<typeof UpdateEventoRiscoSchema>;
