/**
 * Serializador CSV mínimo (RFC 4180: separador vírgula, aspas duplas
 * escapadas quando o valor contém vírgula/aspas/quebra de linha), sem
 * dependência externa — usado pelos endpoints de exportação (ex: histórico
 * consolidado de jornada do Módulo 4, "reduzir a exposição trabalhista",
 * critério exige que o histórico seja produzível como evidência).
 */
export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const escapeCell = (value: unknown): string => {
    const str = value == null ? '' : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const header = columns.map(escapeCell).join(',');
  const lines = rows.map((row) => columns.map((col) => escapeCell(row[col])).join(','));
  return [header, ...lines].join('\r\n');
}
