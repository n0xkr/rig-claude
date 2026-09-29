const PAGE_SIZE = 1000;

/**
 * O PostgREST/Supabase limita cada resposta a `max-rows` (1000 por padrão) e
 * TRUNCA silenciosamente o excedente — perigoso em agregações (KPIs,
 * alertas, histórico) que precisam de TODAS as linhas. Percorre a consulta em
 * páginas via `.range()` até esgotar. `page` deve montar a query completa
 * (filtros + ordenação estável) e aplicar `.range(from, to)`.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Filtros de período recebidos como data (`YYYY-MM-DD`, do `<input type=date>`)
 * precisam virar limites de dia inteiro ao comparar com colunas
 * `timestamptz`: `lte '2026-09-28'` equivale a `<= 2026-09-28T00:00:00Z` e
 * excluiria todo o último dia. Usa o fuso de Brasília (-03:00), o mesmo dos
 * usuários da Rigabras. Valores que já são timestamps completos passam como estão.
 */
export function periodoInicioTs(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00-03:00` : value;
}

export function periodoFimTs(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999-03:00` : value;
}
