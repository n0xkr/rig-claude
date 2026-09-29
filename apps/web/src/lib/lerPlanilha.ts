import { read, utils } from 'xlsx';
import { escanearPlanilha } from '@rigabras/shared';
import type { AbaBruta, PlanilhaEscaneada } from '@rigabras/shared';

/**
 * Lê TODAS as abas do arquivo (inclusive ocultas) como matrizes cruas e entrega à varredura
 * compartilhada, que descobre cabeçalho, tipo de aba, colunas e linhas reais.
 *
 * `sheet_to_json` com `header: 1` NÃO presume cabeçalho na linha 1 (isso era o defeito que deixava
 * todas as colunas em "Não mapear" quando a primeira aba era só texto/instruções).
 */
export async function lerPlanilhaCompleta(file: File): Promise<PlanilhaEscaneada> {
  const buffer = await file.arrayBuffer();
  const wb = read(buffer, { cellDates: true });
  const meta = wb.Workbook?.Sheets ?? [];

  const abas: AbaBruta[] = [];
  wb.SheetNames.forEach((nome, i) => {
    const ws = wb.Sheets[nome];
    if (!ws) return;
    const matriz = utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: true, raw: true });
    // Se a aba começa abaixo da linha 1 (ex.: "!ref" = C5:F90), preserva o nº real da linha do Excel.
    const inicio = ws['!ref'] ? utils.decode_range(ws['!ref']).s.r : 0;
    const comOffset = inicio > 0 ? [...Array.from({ length: inicio }, () => [] as unknown[]), ...matriz] : matriz;
    abas.push({ nome, oculta: (meta[i]?.Hidden ?? 0) !== 0, matriz: comOffset });
  });
  return escanearPlanilha(abas);
}
