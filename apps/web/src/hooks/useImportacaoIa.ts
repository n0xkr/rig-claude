import { useCallback, useRef, useState } from 'react';
import { read, utils, SSF } from 'xlsx';
import type { CellObject } from 'xlsx';
import type {
  AnalisarAbaInput,
  AnalisarAbaResult,
  ImportDataset,
  ResumoSolicitacoes,
} from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';

/**
 * Importação de planilha completa com IA. O navegador lê TODAS as abas e envia
 * uma por requisição (sequencialmente); o servidor não grava nada: a IA gera
 * "solicitações" que o administrador aprova em /solicitacoes-ia.
 */

/** Máximo de linhas por chamada (limite do schema no servidor). */
export const MAX_LINHAS_POR_CHAMADA = 5000;
/** Acima do máximo, a aba é enviada em blocos deste tamanho (mesmo nome de aba; servidor deduplica). */
export const TAMANHO_BLOCO = 2000;
/** Teto absoluto de linhas por aba; o excedente é descartado com aviso. */
export const MAX_LINHAS_POR_ABA = 20000;
const MAX_COLUNAS = 300;
/** Quantas linhas de dados (não vazias) inspecionar para detectar colunas com fórmula. */
const LINHAS_INSPECAO_FORMULA = 20;

export interface AbaLida {
  nome: string;
  cabecalhos: string[];
  colunasCalculadas: string[];
  linhas: Array<Record<string, unknown>>;
  /** Linhas não vazias existentes na planilha (antes de truncar). */
  totalLinhas: number;
  /** Avisos gerados na leitura (truncamento, colunas descartadas...). */
  avisos: string[];
}

export type StatusAba = 'aguardando' | 'enviando' | 'ok' | 'erro' | 'vazia';

export interface AbaExecucao {
  nome: string;
  status: StatusAba;
  resultado?: AnalisarAbaResult;
  erro?: string;
}

export type FaseImportacaoIa = 'inicio' | 'lido' | 'analisando' | 'concluido';

/** Normaliza nome de aba: sem acento, sem caixa, só letras/números. */
export function normalizarNome(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Abas de cadastro vão primeiro, nesta ordem: o servidor usa cadastros anteriores para não perguntar duas vezes. */
const ORDEM_PRIORITARIA: string[][] = [
  ['veiculos', 'veiculo', 'frota'],
  ['motoristas', 'motorista'],
  ['rastreadores', 'rastreador'],
  ['clientes', 'cliente'],
  ['pontosapoio', 'pontoapoio', 'pontosdeapoio', 'pontodeapoio'],
];

function prioridadeAba(nome: string): number {
  const n = normalizarNome(nome);
  const i = ORDEM_PRIORITARIA.findIndex((aliases) => aliases.includes(n));
  return i === -1 ? ORDEM_PRIORITARIA.length : i;
}

/** Ordena as abas: cadastros prioritários primeiro; as demais na ordem do arquivo (sort estável). */
export function ordenarAbas<T extends { nome: string }>(abas: T[]): T[] {
  return abas
    .map((aba, idx) => ({ aba, idx, p: prioridadeAba(aba.nome) }))
    .sort((a, b) => a.p - b.p || a.idx - b.idx)
    .map((x) => x.aba);
}

function celulaVazia(v: unknown): boolean {
  return v === '' || v === null || v === undefined;
}

const dois = (n: number) => String(n).padStart(2, '0');
const quatro = (n: number) => String(n).padStart(4, '0');

/** Formata componentes de data/hora como texto ISO exato, sem fuso: 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH:mm:ss'. */
function formatarIso(y: number, m: number, d: number, H: number, M: number, S: number): string {
  const data = `${quatro(y)}-${dois(m)}-${dois(d)}`;
  return H === 0 && M === 0 && S === 0 ? data : `${data}T${dois(H)}:${dois(M)}:${dois(S)}`;
}

/** Converte o valor de uma célula para o que é enviado ao servidor (datas viram texto ISO local). */
function valorDaCelula(cell: CellObject | undefined, date1904: boolean): unknown {
  if (!cell || cell.v === undefined || cell.v === null) return '';
  if (cell.t === 'e') return '';
  if (cell.v instanceof Date) {
    const dt = cell.v;
    // Componentes locais (não toISOString, que desloca o fuso).
    return formatarIso(
      dt.getFullYear(),
      dt.getMonth() + 1,
      dt.getDate(),
      dt.getHours(),
      dt.getMinutes(),
      dt.getSeconds(),
    );
  }
  if (cell.t === 'n' && typeof cell.v === 'number') {
    if (cell.z !== undefined && SSF.is_date(cell.z)) {
      const p = SSF.parse_date_code(cell.v, { date1904 }) as
        | { y: number; m: number; d: number; H: number; M: number; S: number }
        | null;
      if (p) return formatarIso(p.y, p.m, p.d, p.H, p.M, Math.floor(p.S));
    }
    return cell.v;
  }
  return cell.v;
}

/** Lê a planilha inteira no navegador (datas formatadas como data viram texto ISO sem fuso). */
export async function lerPlanilha(file: File): Promise<AbaLida[]> {
  const buffer = await file.arrayBuffer();
  // Libera a thread para a UI mostrar o "lendo" antes do parse pesado.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const workbook = read(buffer, { cellFormula: true, cellNF: true });
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);

  const abas: AbaLida[] = [];
  for (const nomeOriginal of workbook.SheetNames) {
    const ws = workbook.Sheets[nomeOriginal];
    const nome = nomeOriginal.trim().slice(0, 200) || 'Aba';
    const avisos: string[] = [];
    if (!ws || !ws['!ref']) {
      abas.push({ nome, cabecalhos: [], colunasCalculadas: [], linhas: [], totalLinhas: 0, avisos });
      continue;
    }

    const range = utils.decode_range(ws['!ref']);
    const celula = (r: number, c: number) => ws[utils.encode_cell({ r, c })] as CellObject | undefined;

    // Cabeçalho = 1ª linha do intervalo; colunas sem cabeçalho são puladas; duplicados ganham _1, _2 (como o xlsx).
    const contagem = new Map<string, number>();
    const colunas: Array<{ c: number; cabecalho: string }> = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = celula(range.s.r, c);
      if (!cell || celulaVazia(cell.v)) continue;
      const base = String(cell.w ?? cell.v).trim();
      if (!base) continue;
      const vistas = contagem.get(base) ?? 0;
      contagem.set(base, vistas + 1);
      colunas.push({ c, cabecalho: vistas === 0 ? base : `${base}_${vistas}` });
    }
    if (colunas.length > MAX_COLUNAS) {
      avisos.push(`A aba tem ${colunas.length} colunas; só as primeiras ${MAX_COLUNAS} foram enviadas.`);
      colunas.length = MAX_COLUNAS;
    }

    // Linhas de dados não vazias (guardamos o índice da linha da planilha para achar fórmulas).
    const linhasNaoVazias: Array<{ r: number; obj: Record<string, unknown> }> = [];
    if (colunas.length > 0) {
      for (let r = range.s.r + 1; r <= range.e.r; r += 1) {
        const obj: Record<string, unknown> = {};
        let algum = false;
        for (const col of colunas) {
          const valor = valorDaCelula(celula(r, col.c), date1904);
          if (!celulaVazia(valor)) algum = true;
          obj[col.cabecalho] = valor;
        }
        if (algum) linhasNaoVazias.push({ r, obj });
      }
    }

    // Coluna calculada = alguma das primeiras linhas de dados tem fórmula (cell.f).
    const calculadas = colunas
      .filter((col) =>
        linhasNaoVazias
          .slice(0, LINHAS_INSPECAO_FORMULA)
          .some(({ r }) => Boolean(celula(r, col.c)?.f)),
      )
      .map((col) => col.cabecalho);

    const total = linhasNaoVazias.length;
    let selecionadas = linhasNaoVazias;
    if (total > MAX_LINHAS_POR_ABA) {
      selecionadas = linhasNaoVazias.slice(0, MAX_LINHAS_POR_ABA);
      avisos.push(
        `A aba tem ${total} linhas; só as primeiras ${MAX_LINHAS_POR_ABA} serão analisadas. Divida a planilha para analisar o restante.`,
      );
    }

    abas.push({
      nome,
      cabecalhos: colunas.map((c) => c.cabecalho),
      colunasCalculadas: calculadas,
      linhas: selecionadas.map((x) => x.obj),
      totalLinhas: total,
      avisos,
    });
  }
  return abas;
}

function mensagemErro(err: unknown): string {
  if (err instanceof ApiError) return err.problem.detail ?? err.problem.title;
  if (err instanceof Error && err.message) return err.message;
  return 'Erro inesperado';
}

/** Soma os resultados de blocos da mesma aba. */
function somarResultados(parciais: AnalisarAbaResult[]): AnalisarAbaResult {
  const [primeiro, ...resto] = parciais as [AnalisarAbaResult, ...AnalisarAbaResult[]];
  const uniq = (xs: string[]) => Array.from(new Set(xs));
  return resto.reduce<AnalisarAbaResult>(
    (acc, r) => ({
      ...acc,
      linhasLidas: acc.linhasLidas + r.linhasLidas,
      cadastros: acc.cadastros + r.cadastros,
      atualizacoes: acc.atualizacoes + r.atualizacoes,
      perguntas: acc.perguntas + r.perguntas,
      jaCadastrados: acc.jaCadastrados + r.jaCadastrados,
      colunasCalculadas: uniq([...acc.colunasCalculadas, ...r.colunasCalculadas]),
      avisos: uniq([...acc.avisos, ...r.avisos]),
    }),
    primeiro,
  );
}

export function useImportacaoIa() {
  const [fase, setFase] = useState<FaseImportacaoIa>('inicio');
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [origem, setOrigem] = useState<'EXCEL' | 'CSV'>('EXCEL');
  const [abas, setAbas] = useState<AbaLida[]>([]);
  const [execucao, setExecucao] = useState<AbaExecucao[]>([]);
  const [lendo, setLendo] = useState(false);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoSolicitacoes | null>(null);
  const [loteId, setLoteId] = useState<string | null>(null);
  const ocupado = useRef(false);

  const reiniciar = useCallback(() => {
    setFase('inicio');
    setNomeArquivo('');
    setAbas([]);
    setExecucao([]);
    setErroLeitura(null);
    setErro(null);
    setResumo(null);
    setLoteId(null);
  }, []);

  const lerArquivo = useCallback(async (file: File) => {
    setLendo(true);
    setErroLeitura(null);
    setErro(null);
    setResumo(null);
    setExecucao([]);
    setLoteId(null);
    try {
      const lidas = ordenarAbas(await lerPlanilha(file));
      if (lidas.length === 0) throw new Error('Nenhuma aba encontrada no arquivo.');
      setNomeArquivo(file.name);
      setOrigem(file.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'EXCEL');
      setAbas(lidas);
      setFase('lido');
    } catch (err) {
      setAbas([]);
      setNomeArquivo('');
      setFase('inicio');
      setErroLeitura(
        err instanceof Error && err.message.startsWith('Nenhuma aba')
          ? err.message
          : 'Não foi possível ler o arquivo. Verifique se é uma planilha .xlsx, .xls ou .csv válida.',
      );
    } finally {
      setLendo(false);
    }
  }, []);

  const analisar = useCallback(async () => {
    if (ocupado.current || abas.length === 0) return;
    ocupado.current = true;
    setErro(null);
    setResumo(null);
    setFase('analisando');

    const atualizar = (nome: string, patch: Partial<AbaExecucao>) =>
      setExecucao((prev) => prev.map((e) => (e.nome === nome ? { ...e, ...patch } : e)));

    setExecucao(
      abas.map((a) => ({ nome: a.nome, status: a.linhas.length === 0 ? 'vazia' : 'aguardando' })),
    );

    try {
      let lote: ImportDataset;
      try {
        lote = await api.post<ImportDataset>('/importacoes/lotes', { nome: nomeArquivo, origem });
      } catch (err) {
        setErro(`Não foi possível iniciar a importação: ${mensagemErro(err)}`);
        setExecucao([]);
        setFase('lido');
        return;
      }
      setLoteId(lote.id);

      for (const aba of abas) {
        if (aba.linhas.length === 0) continue;
        atualizar(aba.nome, { status: 'enviando' });
        try {
          const blocos: Array<Array<Record<string, unknown>>> = [];
          if (aba.linhas.length <= MAX_LINHAS_POR_CHAMADA) {
            blocos.push(aba.linhas);
          } else {
            for (let i = 0; i < aba.linhas.length; i += TAMANHO_BLOCO) {
              blocos.push(aba.linhas.slice(i, i + TAMANHO_BLOCO));
            }
          }
          const parciais: AnalisarAbaResult[] = [];
          for (const linhas of blocos) {
            const body: AnalisarAbaInput = {
              aba: aba.nome,
              cabecalhos: aba.cabecalhos,
              colunasCalculadas: aba.colunasCalculadas,
              linhas,
            };
            parciais.push(
              await api.post<AnalisarAbaResult>(`/importacoes/lotes/${lote.id}/abas`, body),
            );
          }
          const resultado = somarResultados(parciais);
          resultado.avisos = [...aba.avisos, ...resultado.avisos];
          atualizar(aba.nome, { status: 'ok', resultado });
        } catch (err) {
          atualizar(aba.nome, { status: 'erro', erro: mensagemErro(err) });
        }
      }

      try {
        await api.post<ImportDataset>(`/importacoes/lotes/${lote.id}/concluir`);
      } catch (err) {
        setErro(`Não foi possível concluir o lote: ${mensagemErro(err)}`);
      }
      try {
        setResumo(await api.get<ResumoSolicitacoes>('/ia-solicitacoes/resumo'));
      } catch {
        // O resumo global é opcional: a UI cai para a soma dos resultados por aba.
      }
      setFase('concluido');
    } finally {
      ocupado.current = false;
    }
  }, [abas, nomeArquivo, origem]);

  return {
    fase,
    nomeArquivo,
    abas,
    execucao,
    lendo,
    erroLeitura,
    erro,
    resumo,
    loteId,
    lerArquivo,
    analisar,
    reiniciar,
  };
}
