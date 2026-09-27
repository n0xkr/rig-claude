import type { FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeAny } from "zod";
import { Problems } from "../lib/problemDetails.js";

/**
 * Helper de validação Zod para body/params/query, retornando RFC 7807 em
 * caso de payload inválido (critério #4/#5). Uso: dentro do handler,
 * `const body = parseOrProblem(BodySchema, request.body, reply); if (!body) return;`
 */
export function parseOrProblem<T extends ZodTypeAny>(
  schema: T,
  data: unknown,
  reply: FastifyReply,
): ReturnType<T["parse"]> | undefined {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_root";
      errors[key] = errors[key] ?? [];
      errors[key].push(issue.message);
    }
    void Problems.unprocessable(reply, "Payload não passou na validação de schema", errors);
    return undefined;
  }
  return result.data;
}

export function assertRequest(_request: FastifyRequest): void {
  // Reservado para futuras validações transversais (ex: idempotency-key).
}
