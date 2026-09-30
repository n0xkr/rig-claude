// Simula a importação inteligente OFFLINE (sem banco, base vazia) sobre planilhas reais, lendo-as como o
// navegador lê. Mostra como cada aba foi entendida e grava o plano em plano.json (e payload.json).
// Uso (em apps/api): GROQ_API_KEY= OUT=/tmp/plano.json npx tsx scripts/simular-importacao.ts "Controle de frota.xlsx" "VEGA.csv"
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('../../web/node_modules/xlsx/xlsx.js');
import { escanearPlanilha } from '@rigabras/shared';
import { interpretarArquivos } from '../src/modules/importacao/inteligente/inteligente.service.js';
import { consolidar } from '../src/modules/importacao/inteligente/consolidacao.js';

const arquivos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const payload = arquivos.map((f) => {
  const nome = f.split(/[\/]/).pop()!;
  const texto = /\.csv$/i.test(f);
  const wb = texto ? XLSX.read(readFileSync(f, 'utf8'), { type: 'string', raw: true }) : XLSX.read(readFileSync(f), { cellDates: true });
  const meta = wb.Workbook?.Sheets ?? [];
  const abas = wb.SheetNames.map((n: string, i: number) => {
    const ws = wb.Sheets[n];
    const m = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
    const ini = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r : 0;
    return { nome: n, oculta: (meta[i]?.Hidden ?? 0) !== 0, matriz: ini > 0 ? [...Array.from({ length: ini }, () => []), ...m] : m };
  });
  const scan = escanearPlanilha(abas);
  // O navegador serializa Date em JSON (string ISO).
  const json = JSON.parse(JSON.stringify(scan));
  return {
    nome,
    abas: json.abas.filter((a: any) => a.tipo === 'TABELA' && a.linhas.length > 0).map((a: any) => ({ nome: a.nome, cabecalhos: a.cabecalhos, linhas: a.linhas })),
    scan: json.abas.map((a: any) => ({ nome: a.nome, tipo: a.tipo, linhas: a.linhas?.length, cab: a.linhaCabecalho })),
  };
});
writeFileSync((process.env.OUT ?? 'plano.json').replace('plano','payload'), JSON.stringify(payload));
for (const p of payload) console.log('SCAN', p.nome, JSON.stringify(p.scan));
const { abas, avisos, statusIa } = await interpretarArquivos({ arquivos: payload.map(({ nome, abas }) => ({ nome, abas })) });
for (const a of abas) console.log('ABA', a.info.arquivo, '›', a.info.aba, a.tipo, a.registros.length, 'regs;', a.info.colunas.map((c) => `${c.coluna}=>${c.campo ?? '-'}`).join(', '));
const plano = consolidar(abas, { veiculos: [], motoristas: [], clientes: [], viagens: [], cargasPorViagem: new Map() }, statusIa);
writeFileSync(process.env.OUT ?? 'plano.json', JSON.stringify({ avisos, plano: { ...plano, viagens: plano.viagens.map((v) => ({ ref: v.ref, dados: v.dados, cargas: v.cargas, motoristaRef: v.motoristaRef, fontes: v.fontes })) }, abas: abas.map((a) => ({ aba: a.info.aba, registros: a.registros })) }, null, 1));
console.log('TOTAIS veiculos', plano.veiculos.length, 'motoristas', plano.motoristas.length, 'clientes', plano.clientes.length, 'viagens', plano.viagens.length, 'erros', plano.erros.length);
