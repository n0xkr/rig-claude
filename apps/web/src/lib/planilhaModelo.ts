import { utils, writeFile } from 'xlsx';
import { PLANILHA_MODELO, PLANILHA_MODELO_INSTRUCOES } from '@rigabras/shared';

/** Gera e baixa a planilha modelo (.xlsx) com as colunas que a importação inteligente reconhece. */
export function baixarPlanilhaModelo() {
  const wb = utils.book_new();

  const leiaMe = utils.aoa_to_sheet([
    ...PLANILHA_MODELO_INSTRUCOES.map((t) => [t]),
    [],
    ['Aba', 'O que preencher'],
    ...PLANILHA_MODELO.map((a) => [a.aba, a.descricao]),
  ]);
  leiaMe['!cols'] = [{ wch: 28 }, { wch: 90 }];
  utils.book_append_sheet(wb, leiaMe, 'LEIA-ME');

  for (const a of PLANILHA_MODELO) {
    const ws = utils.json_to_sheet(a.exemplos, { header: a.colunas });
    ws['!cols'] = a.colunas.map((c) => ({ wch: Math.max(14, c.length + 4) }));
    utils.book_append_sheet(wb, ws, a.aba);
  }

  writeFile(wb, 'Rigabras - planilha modelo.xlsx');
}
