import { z } from 'zod';
import { UserRoleSchema } from '../enums.js';

/** Foto de perfil enviada como data URL já reduzida no navegador (≤ ~150 KB). */
export const AVATAR_MAX_BYTES = 150_000;
const AvatarDataUrlSchema = z
  .string()
  .max(Math.round(AVATAR_MAX_BYTES * 1.4), 'Foto muito grande')
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, 'Formato de imagem inválido');

/** Perfil do usuário logado (Painel do usuário). `email` e `role` nunca são editáveis pelo próprio usuário. */
export const PerfilSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: UserRoleSchema,
  nome_completo: z.string(),
  avatar_url: z.string().nullable().optional(),
  funcao: z.string().nullable().optional(),
  atribuicoes: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  departamento: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  created_at: z.string().optional(),
  /** Calculado pela API (lista de e-mails autorizados): o menu só mostra a Auditoria a quem pode vê-la. */
  pode_ver_auditoria: z.boolean().optional(),
});
export type Perfil = z.infer<typeof PerfilSchema>;

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const UpdatePerfilSchema = z
  .object({
    nome_completo: z.string().trim().min(2).max(200),
    funcao: textoOpcional(120),
    atribuicoes: textoOpcional(2000),
    telefone: textoOpcional(40),
    departamento: textoOpcional(120),
    bio: textoOpcional(1000),
    /** `null` remove a foto. */
    avatar_url: AvatarDataUrlSchema.nullable(),
  })
  .partial()
  .strict();
export type UpdatePerfilInput = z.infer<typeof UpdatePerfilSchema>;
