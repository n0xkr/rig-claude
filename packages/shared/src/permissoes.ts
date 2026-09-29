import { z } from 'zod';
import type { UserRole } from './enums.js';

/**
 * Módulos do sistema que podem ser liberados/bloqueados por categoria de usuário
 * ou por usuário (tela Usuários → Categorias/Permissões). Usuários, Perfil e
 * Auditoria ficam fora: Usuários é sempre exclusivo de SUPERADMIN, Perfil é de
 * todos e Auditoria segue a lista de e-mails `AUDITORIA_EMAILS`.
 *
 * As permissões de módulo complementam o papel (RBAC): o papel define o que a
 * pessoa pode fazer (ler/escrever/aprovar) e os módulos definem ONDE ela entra.
 */
export const MODULOS = [
  { key: 'painel', label: 'Painel' },
  { key: 'viagens', label: 'Viagens' },
  { key: 'rigabras_ai', label: 'RIGABRAS AI' },
  { key: 'portaria', label: 'Portaria' },
  { key: 'fronteira', label: 'KPIs de fronteira' },
  { key: 'fretes', label: 'Financeiro do frete' },
  { key: 'acompanhamento', label: 'Acompanhamento de veículos' },
  { key: 'frota', label: 'Frota e manutenções' },
  { key: 'motoristas', label: 'Motoristas' },
  { key: 'jornada', label: 'Jornada de motoristas' },
  { key: 'wms', label: 'WMS — Armazém' },
  { key: 'exportacoes', label: 'Exportações (ERP)' },
  { key: 'importacao', label: 'Importação de dados' },
  { key: 'solicitacoes_ia', label: 'Solicitações da IA' },
] as const;

export type ModuloKey = (typeof MODULOS)[number]['key'];
export const MODULO_KEYS = MODULOS.map((m) => m.key) as [ModuloKey, ...ModuloKey[]];
export const ModuloKeySchema = z.enum(MODULO_KEYS);

/** Lista de módulos sem repetição; aceita vazia (categoria que não libera nada). */
export const PermissoesSchema = z
  .array(ModuloKeySchema)
  .max(MODULO_KEYS.length * 2)
  .transform((mods) => [...new Set(mods)]);

/**
 * Permissões efetivas: a lista do próprio usuário (quando definida) vence a da
 * categoria; sem nenhuma das duas, `null` = todos os módulos (comportamento de
 * antes das categorias, governado só pelo papel). SUPERADMIN sempre tem tudo.
 */
export function resolverPermissoes(
  role: UserRole,
  permissoesUsuario: readonly string[] | null | undefined,
  permissoesCategoria: readonly string[] | null | undefined,
): ModuloKey[] | null {
  if (role === 'SUPERADMIN') return null;
  const fonte = permissoesUsuario ?? permissoesCategoria;
  if (fonte == null) return null;
  const validos = new Set<string>(MODULO_KEYS);
  return [...new Set(fonte)].filter((m): m is ModuloKey => validos.has(m));
}

/** `null` (sem restrição) libera tudo; senão o módulo precisa estar na lista. */
export function temModulo(
  permissoes: readonly string[] | null | undefined,
  modulo: ModuloKey,
): boolean {
  return permissoes == null || permissoes.includes(modulo);
}

export const CategoriaUsuarioSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  descricao: z.string().nullable().optional(),
  permissoes: z.array(z.string()),
  created_at: z.string().optional(),
  updated_at: z.string().nullable().optional(),
  /** Calculado pela API: quantos usuários estão nesta categoria. */
  total_usuarios: z.number().int().optional(),
});
export type CategoriaUsuario = z.infer<typeof CategoriaUsuarioSchema>;

export const CreateCategoriaUsuarioSchema = z
  .object({
    nome: z.string().trim().min(2, 'Nome muito curto').max(80),
    descricao: z
      .string()
      .trim()
      .max(500)
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .optional(),
    permissoes: PermissoesSchema,
  })
  .strict();
export type CreateCategoriaUsuarioInput = z.infer<typeof CreateCategoriaUsuarioSchema>;

export const UpdateCategoriaUsuarioSchema = CreateCategoriaUsuarioSchema.partial().strict();
export type UpdateCategoriaUsuarioInput = z.infer<typeof UpdateCategoriaUsuarioSchema>;
