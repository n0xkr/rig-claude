/**
 * Serializador CSV mínimo (RFC 4180: separador vírgula, aspas duplas
 * escapadas quando o valor contém vírgula/aspas/quebra de linha), sem
 * dependência externa — usado pelos endpoints de exportação (ex: histórico
 * consolidado de jornada do Módulo 4, "reduzir a exposição trabalhista",
 * critério exige que o histórico seja produzível como evidência).
 */
export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const escapeCell = (value: unknown): string => {
    let str = value == null ? '' : String(value);
    // Formula injection (CSV aberto no Excel/Sheets): texto que começa com = + - @ vira fórmula.
    // Números de verdade (ex.: -12,5) não são afetados.
    if (
      typeof value === 'string' &&
      /^[=+\-@\t\r]/.test(str) &&
      !/^[-+]?\d+([.,]\d+)?$/.test(str)
    ) {
      str = `'${str}`;
    }
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const header = columns.map(escapeCell).join(',');
  const lines = rows.map((row) => columns.map((col) => escapeCell(row[col])).join(','));
  return [header, ...lines].join('\r\n');
}
