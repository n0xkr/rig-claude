import { z } from "zod";
import { UserRoleSchema } from "../enums.js";

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  nome_completo: z.string().min(2),
  email: z.string().email(),
  role: UserRoleSchema.default("VISITANTE"),
  ativo: z.boolean().default(true),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof LoginSchema>;
