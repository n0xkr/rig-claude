/**
 * Colunas `date` do Postgres (ex: `data_manutencao`, `data_pagamento`) chegam
 * como `YYYY-MM-DD`. `new Date('2026-09-28')` interpreta isso como meia-noite
 * UTC e, no fuso de Brasília (UTC-3), `toLocaleDateString` mostraria o dia
 * ANTERIOR (27/09). Estes helpers tratam a data como data de calendário local.
 */
export function formatDateOnly(value: string): string {
  const [ano, mes, dia] = value.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Data de hoje (calendário local) como `YYYY-MM-DD`, para o `value` inicial de `<input type="date">` — `toISOString()` usaria a data UTC e viraria "amanhã" depois das 21h em Brasília. */
export function todayLocalIso(): string {
  const now = new Date();
  const mes = String(now.getMonth() + 1).padStart(2, '0');
  const dia = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mes}-${dia}`;
}
