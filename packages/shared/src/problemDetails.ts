import { z } from "zod";

/**
 * RFC 7807 Problem Details - formato padrão de erro da API (critério #5).
 */
export const ProblemDetailsSchema = z.object({
  type: z.string().default("about:blank"),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  correlationId: z.string().optional(),
  errors: z.record(z.array(z.string())).optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export const PAGINATION_DEFAULTS = {
  limit: 20,
  maxLimit: 100,
} as const;

export const PaginationQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(PAGINATION_DEFAULTS.maxLimit).default(PAGINATION_DEFAULTS.limit),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    nextCursor: z.string().uuid().nullable(),
  });
}
