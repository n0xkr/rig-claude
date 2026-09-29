/**
 * Roda a etapa 1 da importação (varredura + padronização) sobre matrizes cruas, exatamente como
 * o backend faz com o que o navegador envia. Usado por scripts/auditar_importacao.py para
 * conferir o resultado contra uma leitura independente (pandas/openpyxl).
 *
 * Uso: npx tsx scripts/padronizar-planilha.ts entrada.json saida.json
 *   entrada: [{ arquivo, abas: [{ nome, oculta, matriz: unknown[][] }] }]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { escanearPlanilha } from '@rigabras/shared';
import { padronizarAba } from '../src/modules/importacao/inteligente/padronizacao.js';

const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) {
  console.error('uso: padronizar-planilha.ts entrada.json saida.json');
  process.exit(2);
}
const arquivos = JSON.parse(readFileSync(entrada, 'utf8')) as Array<{
  arquivo: string;
  abas: Array<{ nome: string; oculta?: boolean; matriz: unknown[][] }>;
}>;

const out = arquivos.map((a) => {
  const scan = escanearPlanilha(a.abas);
  return {
    arquivo: a.arquivo,
    abas: scan.abas.map((s) => {
      if (s.tipo !== 'TABELA') return { nome: s.nome, tipo: s.tipo, linhaCabecalho: s.linhaCabecalho };
      const p = padronizarAba({
        nome: s.nome,
        cabecalhos: s.cabecalhos,
        linhas: s.linhas as Array<Record<string, string | number | boolean | null>>,
      });
      return {
        nome: s.nome,
        tipo: s.tipo,
        linhaCabecalho: s.linhaCabecalho,
        linhasDescartadasVarredura: s.linhasDescartadas,
        cabecalhosVarredura: s.cabecalhos,
        cabecalhos: p.cabecalhos,
        colunas: p.colunas,
        descartadas: p.descartadas,
        duplicadas: p.duplicadas,
        linhas: p.linhas,
      };
    }),
  };
});
writeFileSync(saida, JSON.stringify(out));
