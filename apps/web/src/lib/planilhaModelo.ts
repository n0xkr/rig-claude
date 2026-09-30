import { utils, writeFile } from 'xlsx';
import { PLANILHA_MODELO, PLANILHA_MODELO_INSTRUCOES } from '@rigabras/shared';

/**
 * Gera e baixa a PLANILHA PADRÃO (.xlsx): todas as colunas que o sistema sabe gravar, uma aba por
 * assunto (viagens, motoristas, veículos, clientes, CRT/DANFE, checklists, SMP, consultas), uma
 * linha de exemplo e o dicionário de campos. Importada de volta, nada fica "sem campo".
 */
export function baixarPlanilhaModelo() {
  const wb = utils.book_new();

  const leiaMe = utils.aoa_to_sheet([
    ...PLANILHA_MODELO_INSTRUCOES.map((t) => [t]),
    [],
    ['Aba', 'Colunas', 'O que preencher'],
    ...PLANILHA_MODELO.map((a) => [a.aba, a.colunas.length, a.descricao]),
  ]);
  leiaMe['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 100 }];
  utils.book_append_sheet(wb, leiaMe, 'LEIA-ME');

  for (const a of PLANILHA_MODELO) {
    const ws = utils.json_to_sheet(a.exemplos, { header: a.colunas });
    ws['!cols'] = a.colunas.map((c) => ({ wch: Math.max(14, c.length + 4) }));
    utils.book_append_sheet(wb, ws, a.aba);
  }

  // Dicionário: o que cada coluna alimenta, tipo e formato esperado.
  const dicionario = utils.aoa_to_sheet([
    ['Aba', 'Coluna', 'Tipo', 'Obrigatória', 'Como preencher'],
    ...PLANILHA_MODELO.flatMap((a) => a.detalhes.map((d) => [a.aba, d.coluna, d.tipo, d.obrigatoria ? 'Sim' : '', d.dica])),
  ]);
  dicionario['!cols'] = [{ wch: 16 }, { wch: 32 }, { wch: 14 }, { wch: 12 }, { wch: 100 }];
  utils.book_append_sheet(wb, dicionario, 'Dicionário de campos');

  writeFile(wb, 'Rigabras - planilha padrao.xlsx');
}
