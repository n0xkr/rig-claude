import type { AbaImportacaoInput } from '@rigabras/shared';
import { normTexto } from '../../iaSolicitacoes/leitura.js';

/**
 * Etapa 1 da importação: tratamento e padronização, ANTES de qualquer interpretação.
 *
 * O navegador só abre o arquivo e entrega as células (o arquivo nunca é aberto no servidor).
 * Aqui cada aba é varrida coluna por coluna e linha por linha:
 *   1. Cabeçalhos: limpos (BOM, espaços invisíveis, quebras), nomes perigosos neutralizados
 *      (`__proto__`...), repetidos numerados.
 *   2. Linhas: vazias, cabeçalho repetido no meio dos dados e linhas de total são descartadas,
 *      sempre com o motivo.
 *   3. Colunas: o tipo é decidido olhando TODAS as células da coluna (não célula a célula), o
 *      que resolve ambiguidades que uma célula sozinha não resolve — "9,026" numa coluna de
 *      milhares de kg é 9.026 kg; "05/06/2024" numa coluna onde aparece "25/06/2024" é dd/mm.
 *   4. Células: convertidas para a forma canônica do tipo da coluna. A que não se encaixa fica
 *      com o texto original limpo e é contada como inconsistência (com o nº da linha).
 *
 * Formas canônicas: numero -> number; data -> "YYYY-MM-DD"; datahora -> "YYYY-MM-DDTHH:mm"
 * (hora local da planilha); hora -> "HH:mm"; booleano -> boolean; placa -> "ABC1D23";
 * placas -> "ABC1D23/DEF4G56"; codigo/texto -> string limpa; vazio -> null.
 */

export type TipoCanonico =
  | 'vazio'
  | 'booleano'
  | 'hora'
  | 'data'
  | 'datahora'
  | 'placa'
  | 'placas'
  | 'numero'
  | 'codigo'
  | 'texto';

export type Celula = string | number | boolean | null;
/** Linha padronizada: objeto sem protótipo (nome de coluna nunca vira propriedade herdada). */
export type LinhaPadronizada = Record<string, Celula>;

export interface PerfilColunaPadronizada {
  coluna: string;
  /** Nome como veio na planilha (antes da limpeza). */
  original: string;
  tipo: TipoCanonico;
  /** Detalhe do formato encontrado: "numero-br", "data-dmy", "placas-conjunto"... */
  formato: string | null;
  preenchidas: number;
  distintos: number;
  exemplos: string[];
  /** Células convertidas (o valor mudou de forma: "10.781,00" -> 10781). */
  convertidas: number;
  /** Células que não se encaixam no tipo da coluna (mantidas como texto). */
  inconsistencias: number;
  exemplosInconsistencia: Array<{ linha: number; valor: string }>;
}

export interface AbaPadronizada {
  nome: string;
  cabecalhos: string[];
  linhas: LinhaPadronizada[];
  colunas: PerfilColunaPadronizada[];
  descartadas: Array<{ linha: number; motivo: string }>;
  /** Linhas idênticas a outra linha da mesma aba (mantidas; a consolidação decide). */
  duplicadas: number;
}

/** Limites de segurança/performance por requisição (aplicados em `validarVolume`). */
export const LIMITES = {
  celulasPorRequisicao: 3_000_000,
  tamanhoCelula: 5_000,
  tamanhoCabecalho: 200,
};

const LIMITE_EXEMPLOS = 5;
/** Fração mínima das células preenchidas que precisa se encaixar para a coluna ter o tipo. */
const COBERTURA_MINIMA = 0.9;

// ---------------------------------------------------------------------------
// Limpeza básica
// ---------------------------------------------------------------------------

const INVISIVEIS = /[​-‍⁠﻿]/g;
const ESPACOS = /[\s  ]+/g;
const PLACEHOLDERS = new Set([
  '', '-', '--', '---', '—', '–', '.', 'n/a', 'na', 'n.a.', 'null', 'undefined', 'nan', 'none',
  '#n/a', '#n/d', '#ref!', '#value!', '#valor!', '#div/0!', '#name?', '#nome?', '#null!', '#num!',
  'x x', 'a definir', 'nao se aplica', 'não se aplica', 's/n', '0000-00-00',
]);
const NOMES_PROIBIDOS = new Set(['__proto__', 'prototype', 'constructor', '__linha']);

export function limparTexto(v: string): string {
  return v.normalize('NFC').replace(INVISIVEIS, '').replace(ESPACOS, ' ').trim();
}

/** Valor bruto da célula -> string limpa | number | boolean | null (tipos que o JSON pode trazer). */
function celulaBruta(v: unknown): Celula {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const t = limparTexto(v).slice(0, LIMITES.tamanhoCelula);
    return PLACEHOLDERS.has(t.toLowerCase()) ? null : t;
  }
  return null; // objetos/arrays nunca são aceitos como célula
}

function limparCabecalho(bruto: string): string {
  const t = limparTexto(String(bruto ?? ''))
    .replace(/^[★☆*•·#>\-–—\s]+/, '')
    .replace(/[\s*:]+$/, '')
    .slice(0, LIMITES.tamanhoCabecalho);
  return NOMES_PROIBIDOS.has(t.toLowerCase()) ? `Coluna ${t.replace(/_/g, '')}` : t;
}

// ---------------------------------------------------------------------------
// Leitores por tipo (célula -> forma canônica | undefined se não se encaixa)
// ---------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0');

const MESES: Record<string, number> = {
  jan: 1, ene: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, ago: 8,
  aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dic: 12, dec: 12,
};

const SIM = /^(sim|s|x|ok|yes|y|true|verdadeiro|v|feito|feita|concluido|concluida|✓|✔)$/i;
const NAO = /^(nao|não|n|no|false|falso|f|pendente)$/i;

function lerBooleano(c: Celula): boolean | undefined {
  if (typeof c === 'boolean') return c;
  if (typeof c !== 'string') return undefined;
  if (SIM.test(c)) return true;
  if (NAO.test(c)) return false;
  return undefined;
}

/** "09:00", "9h30", "20:36:00", "1899-12-30T09:00" (célula de hora do Excel) -> "HH:mm". */
function lerHora(c: Celula): string | undefined {
  if (typeof c !== 'string') return undefined;
  const r = c.match(/^(?:1899-12-3[01]T)?(\d{1,2})[:h](\d{2})(?::\d{2}(?:\.\d+)?)?\s*(h|hs|hrs)?$/i);
  if (!r) return undefined;
  const H = Number(r[1]);
  const M = Number(r[2]);
  return H < 24 && M < 60 ? `${pad2(H)}:${pad2(M)}` : undefined;
}

interface PartesData {
  a: number; // primeiro número (dia, se dmy)
  b: number; // segundo número (mês, se dmy)
  y: number;
  hm: string | null;
  /** Formato já inequívoco (ISO ou mês por extenso): dispensa decidir dmy/mdy. */
  fixo?: { d: number; m: number };
}

const HORA_SUFIXO = /(?:[\sT]+(\d{1,2})[:h](\d{2})(?::\d{2}(?:\.\d+)?)?)?\s*$/;

function partesData(c: Celula): PartesData | undefined {
  if (typeof c !== 'string') return undefined;
  const hm = (h?: string, m?: string) => (h !== undefined && m !== undefined ? `${pad2(Number(h))}:${m}` : null);
  let r = c.match(new RegExp(`^(\\d{4})-(\\d{1,2})-(\\d{1,2})${HORA_SUFIXO.source}`));
  if (r) {
    const [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
    return { a: d, b: m, y, hm: hm(r[4], r[5]), fixo: { d, m } };
  }
  r = c.match(new RegExp(`^(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{2}|\\d{4})${HORA_SUFIXO.source}`));
  if (r) {
    let y = Number(r[3]);
    if (y < 100) y += 2000;
    return { a: Number(r[1]), b: Number(r[2]), y, hm: hm(r[4], r[5]) };
  }
  // "22.mai.2024", "24-Out-2024", "3 de março de 2025"
  r = c.match(new RegExp(`^(\\d{1,2})(?:\\s+de)?[\\s./-]*([a-zçA-ZÇ]{3,9})\\.?(?:\\s+de)?[\\s./-]*(\\d{2}|\\d{4})${HORA_SUFIXO.source}`));
  if (r) {
    const m = MESES[normTexto(r[2]).slice(0, 3)];
    if (!m) return undefined;
    let y = Number(r[3]);
    if (y < 100) y += 2000;
    const d = Number(r[1]);
    return { a: d, b: m, y, hm: hm(r[4], r[5]), fixo: { d, m } };
  }
  return undefined;
}

function montarData(d: number, m: number, y: number): string | undefined {
  if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1) return undefined;
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d > ultimo ? undefined : `${y}-${pad2(m)}-${pad2(d)}`;
}

function lerData(c: Celula, ordem: 'dmy' | 'mdy', serial: boolean): { valor: string; comHora: boolean } | undefined {
  // Serial do Excel (dias desde 1899-12-30), só em coluna que o cabeçalho diz ser data.
  if (typeof c === 'number') {
    if (!serial || c < 20000 || c > 80000) return undefined;
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(c * 86400) * 1000);
    const dia = `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
    const frac = c % 1;
    return frac > 0
      ? { valor: `${dia}T${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}`, comHora: true }
      : { valor: dia, comHora: false };
  }
  const p = partesData(c);
  if (!p) return undefined;
  const [d, m] = p.fixo ? [p.fixo.d, p.fixo.m] : ordem === 'dmy' ? [p.a, p.b] : [p.b, p.a];
  const dia = montarData(d, m, p.y);
  if (!dia) return undefined;
  return p.hm ? { valor: `${dia}T${p.hm}`, comHora: true } : { valor: dia, comHora: false };
}

// --- números ---------------------------------------------------------------

interface LeituraNumero {
  /** Valor pelo padrão brasileiro ("." milhar, "," decimal). */
  br?: number;
  /** Valor pelo padrão americano ("," milhar, "." decimal). */
  us?: number;
  /** Um só separador seguido de exatamente 3 dígitos ("9,026", "8.715"): pode ser milhar ou decimal. */
  ambiguo: boolean;
}

const MOEDA = /^(?:r\$|us\$|u\$s|\$|€|usd|brl|ars|pyg|clp|uyu)\s*|\s*(?:r\$|us\$|usd|brl|kg|t|ton|%)$/gi;

function leituraNumero(c: Celula): LeituraNumero | undefined {
  if (typeof c === 'number') return { br: c, us: c, ambiguo: false };
  if (typeof c !== 'string') return undefined;
  let s = c.replace(MOEDA, '').replace(/\s/g, '');
  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negativo = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  if (!/^\d[\d.,]*$/.test(s) || /[.,]$/.test(s)) return undefined;
  const sinal = negativo ? -1 : 1;
  const pontos = (s.match(/\./g) ?? []).length;
  const virgulas = (s.match(/,/g) ?? []).length;
  const num = (t: string) => {
    const n = Number(t);
    return Number.isFinite(n) ? sinal * n : undefined;
  };
  if (pontos === 0 && virgulas === 0) return { br: num(s), us: num(s), ambiguo: false };
  // Os dois separadores: o último é o decimal.
  if (pontos > 0 && virgulas > 0) {
    const ultimoPonto = s.lastIndexOf('.');
    const ultimaVirgula = s.lastIndexOf(',');
    if (ultimaVirgula > ultimoPonto) {
      return /^\d{1,3}(\.\d{3})*,\d+$/.test(s) ? { br: num(s.replace(/\./g, '').replace(',', '.')), ambiguo: false } : undefined;
    }
    return /^\d{1,3}(,\d{3})*\.\d+$/.test(s) ? { us: num(s.replace(/,/g, '')), ambiguo: false } : undefined;
  }
  const sep = pontos > 0 ? '.' : ',';
  const n = pontos + virgulas;
  const grupos = s.split(sep);
  const milhar = /^\d{1,3}$/.test(grupos[0]!) && grupos.slice(1).every((g) => /^\d{3}$/.test(g));
  if (n > 1) {
    // "1.234.567" / "1,234,567": só pode ser milhar.
    if (!milhar) return undefined;
    const v = num(grupos.join(''));
    return sep === '.' ? { br: v, ambiguo: false } : { us: v, ambiguo: false };
  }
  const decimal = num(`${grupos[0]}.${grupos[1]}`);
  const inteiro = num(grupos.join(''));
  if (!milhar) {
    // "10,5" / "10.5": só pode ser decimal.
    return sep === ',' ? { br: decimal, ambiguo: false } : { us: decimal, ambiguo: false };
  }
  return sep === ','
    ? { br: decimal, us: inteiro, ambiguo: true }
    : { br: inteiro, us: decimal, ambiguo: true };
}

// --- códigos, placas --------------------------------------------------------

const HEADER_CODIGO = /(^|\s)(n|no|nro|num|numero|cod|codigo|id|cpf|cnpj|cuit|rut|ruc|rg|cnh|crt|mic|dta|nf|nfe|danfe|chave|lote|fatura|transporte|pedido|ordem|os|cep|telefone|celular|fone|whatsapp|rntrc|renavam|chassi|matricula|container|lacre|protocolo|ref|referencia)(\s|$)/;
const HEADER_DATA = /(^|\s)(data|dt|dia|date|fecha|vencimento|venc|emissao|previsao|prev|validade|nascimento|admissao|inicio|fim|termino|chegada|saida|entrega|coleta|carregamento|descarga)(\s|$)/;
const HEADER_HORA = /(^|\s)(hora|horario|hr|hs|time)(\s|$)/;
const HEADER_NAO_PLACA = /(^|\s)(tipo|modelo|marca|motorista|nome|status|obs|observac)/;

export function comoPlaca(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const p = String(v).replace(/[\s.-]+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{6,8}$/.test(p)) return null;
  const letras = p.replace(/[^A-Z]/g, '').length;
  const digitos = p.replace(/[^0-9]/g, '').length;
  return letras >= 2 && digitos >= 2 && /^[A-Z]{2,3}/.test(p) ? p : null;
}

/** "MLM1E90/MMA9I46", "ABC1234 - DEF5678", "JDE5H07IZR9B80" (coladas) -> placas na ordem. */
export function extrairPlacas(v: unknown): string[] {
  if (typeof v !== 'string' && typeof v !== 'number') return [];
  const inteira = comoPlaca(v);
  if (inteira) return [inteira];
  const out: string[] = [];
  for (const parte of String(v).split(/[/;,|+&\n]|\s+-\s+|\s+e\s+/i)) {
    const p = comoPlaca(parte);
    if (p) {
      out.push(p);
      continue;
    }
    for (const pedaco of parte.trim().split(/\s+/)) {
      const q = comoPlaca(pedaco);
      if (q) out.push(q);
      else if (/^[A-Z]{3}\d[A-Z0-9]\d{2}[A-Z]{3}\d[A-Z0-9]\d{2}$/i.test(pedaco))
        out.push(pedaco.slice(0, 7).toUpperCase(), pedaco.slice(7).toUpperCase());
    }
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// Decisão do tipo da coluna
// ---------------------------------------------------------------------------

interface Decisao {
  tipo: TipoCanonico;
  formato: string | null;
  converter: (c: Celula) => Celula | undefined;
}

const cobre = (celulas: Celula[], f: (c: Celula) => unknown) => {
  if (celulas.length === 0) return 0;
  let ok = 0;
  for (const c of celulas) if (f(c) !== undefined) ok++;
  return ok / celulas.length;
};

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function decidirNumero(celulas: Celula[], nomeNorm: string): Decisao | null {
  const leituras = celulas.map(leituraNumero);
  if (leituras.filter(Boolean).length / celulas.length < COBERTURA_MINIMA) return null;
  // Código numérico ("00123", CPF, chave de 44 dígitos, cabeçalho de nº/código): continua texto.
  const codigoPeloConteudo = celulas.some((c) => typeof c === 'string' && (/^0\d/.test(c) || /^\d{15,}$/.test(c)));
  if (HEADER_CODIGO.test(nomeNorm) || codigoPeloConteudo) return null;

  // Padrão da coluna pelas células que não deixam dúvida.
  let br = 0;
  let us = 0;
  const firmes: number[] = [];
  for (const l of leituras) {
    if (!l || l.ambiguo) continue;
    if (l.br !== undefined && l.us === undefined) br++;
    if (l.us !== undefined && l.br === undefined) us++;
    const v = l.br ?? l.us;
    if (v !== undefined && v !== 0) firmes.push(Math.abs(v));
  }
  const padrao: 'br' | 'us' = us > br ? 'us' : 'br';
  const ref = mediana(firmes);
  const distancia = (v: number) => (ref === null || v === 0 ? 0 : Math.abs(Math.log10(Math.abs(v)) - Math.log10(ref)));

  return {
    tipo: 'numero',
    formato: `numero-${padrao}`,
    converter: (c) => {
      const l = leituraNumero(c);
      if (!l) return undefined;
      if (!l.ambiguo) return padrao === 'br' ? (l.br ?? l.us) : (l.us ?? l.br);
      // "9,026" numa coluna de dezenas de milhares é 9026, não 9,026: vence a leitura mais
      // próxima (em ordem de grandeza) dos valores inequívocos da mesma coluna.
      if (ref !== null) return distancia(l.br!) <= distancia(l.us!) ? l.br : l.us;
      return padrao === 'br' ? l.br : l.us;
    },
  };
}

function decidirData(celulas: Celula[], nomeNorm: string): Decisao | null {
  const serial = HEADER_DATA.test(nomeNorm);
  // dd/mm ou mm/dd: decidido pela coluna (qualquer "25/06" prova dd/mm; "06/25" prova mm/dd).
  let provaDmy = 0;
  let provaMdy = 0;
  for (const c of celulas) {
    const p = partesData(c);
    if (!p || p.fixo) continue;
    if (p.a > 12 && p.b <= 12) provaDmy++;
    if (p.b > 12 && p.a <= 12) provaMdy++;
  }
  const ordem: 'dmy' | 'mdy' = provaMdy > provaDmy ? 'mdy' : 'dmy';
  const lidas = celulas.map((c) => lerData(c, ordem, serial));
  if (lidas.filter(Boolean).length / celulas.length < COBERTURA_MINIMA) return null;
  const comHora = lidas.some((l) => l?.comHora);
  return {
    tipo: comHora ? 'datahora' : 'data',
    formato: `data-${ordem}`,
    converter: (c) => lerData(c, ordem, serial)?.valor,
  };
}

function decidirTipo(celulas: Celula[], nomeNorm: string): Decisao {
  const texto: Decisao = {
    tipo: 'texto',
    formato: null,
    converter: (c) => (c === null ? null : typeof c === 'string' ? c : String(c)),
  };
  if (celulas.length === 0) return { tipo: 'vazio', formato: null, converter: () => null };

  // Booleano: Sim/Não/X/OK (0/1 só se o cabeçalho não for de número/código).
  if (cobre(celulas, lerBooleano) >= COBERTURA_MINIMA && new Set(celulas.map(String)).size <= 6)
    return { tipo: 'booleano', formato: null, converter: lerBooleano };

  if (cobre(celulas, lerHora) >= COBERTURA_MINIMA || (HEADER_HORA.test(nomeNorm) && cobre(celulas, lerHora) >= 0.6))
    return { tipo: 'hora', formato: 'hora-hh:mm', converter: lerHora };

  const data = decidirData(celulas, nomeNorm);
  if (data) return data;

  if (!HEADER_NAO_PLACA.test(nomeNorm)) {
    const umaPlaca = cobre(celulas, (c) => comoPlaca(c) ?? undefined);
    const conjunto = cobre(celulas, (c) => (extrairPlacas(c).length > 0 ? true : undefined));
    if (umaPlaca >= COBERTURA_MINIMA)
      return { tipo: 'placa', formato: null, converter: (c) => comoPlaca(c) ?? undefined };
    if (conjunto >= COBERTURA_MINIMA)
      return {
        tipo: 'placas',
        formato: 'placas-conjunto',
        converter: (c) => {
          const ps = extrairPlacas(c);
          return ps.length > 0 ? ps.join('/') : undefined;
        },
      };
  }

  const numero = decidirNumero(celulas, nomeNorm);
  if (numero) return numero;

  if (HEADER_CODIGO.test(nomeNorm))
    return {
      tipo: 'codigo',
      formato: null,
      // Código que o Excel guardou como número (13119132) volta a ser texto, sem ".0".
      converter: (c) => (c === null ? null : String(c)),
    };
  return texto;
}

// ---------------------------------------------------------------------------
// Aba
// ---------------------------------------------------------------------------

const RE_TOTAL = /^(total|totais|subtotal|sub total|soma|total geral)\b/;

export function padronizarAba(aba: AbaImportacaoInput): AbaPadronizada {
  // 1. Cabeçalhos
  const originais = aba.cabecalhos.filter((h) => h !== '__linha');
  const usados = new Map<string, number>();
  const cabecalhos = originais.map((h, i) => {
    let nome = limparCabecalho(h) || `Coluna ${i + 1}`;
    const n = (usados.get(nome.toLowerCase()) ?? 0) + 1;
    usados.set(nome.toLowerCase(), n);
    if (n > 1) nome = `${nome} (${n})`;
    return nome;
  });
  const normCab = cabecalhos.map((h) => normTexto(h));

  // 2. Linhas: células brutas limpas + descartes
  const descartadas: AbaPadronizada['descartadas'] = [];
  const brutas: Array<{ linha: number; celulas: Celula[] }> = [];
  aba.linhas.forEach((l, i) => {
    const linha = typeof l.__linha === 'number' ? l.__linha : i + 2;
    const celulas = originais.map((h) => celulaBruta(l[h]));
    const cheias = celulas.filter((c) => c !== null);
    if (cheias.length === 0) return descartadas.push({ linha, motivo: 'linha vazia' });
    const iguaisAoCabecalho = celulas.filter((c, k) => c !== null && normTexto(c) === normCab[k]).length;
    if (iguaisAoCabecalho >= Math.max(2, cheias.length * 0.6))
      return descartadas.push({ linha, motivo: 'cabeçalho repetido' });
    const primeira = cheias[0];
    if (typeof primeira === 'string' && RE_TOTAL.test(normTexto(primeira)) && cheias.slice(1).every((c) => typeof c === 'number' || leituraNumero(c) !== undefined))
      return descartadas.push({ linha, motivo: 'linha de total' });
    brutas.push({ linha, celulas });
  });

  // 3. Tipo de cada coluna (olhando todas as linhas) e 4. conversão célula a célula
  const linhas: LinhaPadronizada[] = brutas.map(({ linha }) => {
    const o = Object.create(null) as LinhaPadronizada;
    o.__linha = linha;
    return o;
  });
  const colunas: PerfilColunaPadronizada[] = cabecalhos.map((coluna, k) => {
    const preenchidas = brutas.map((b) => b.celulas[k]!).filter((c) => c !== null);
    const decisao = decidirTipo(preenchidas, normCab[k]!);
    const perfil: PerfilColunaPadronizada = {
      coluna,
      original: originais[k]!,
      tipo: decisao.tipo,
      formato: decisao.formato,
      preenchidas: preenchidas.length,
      distintos: 0,
      exemplos: [],
      convertidas: 0,
      inconsistencias: 0,
      exemplosInconsistencia: [],
    };
    const distintos = new Set<string>();
    brutas.forEach((b, i) => {
      const bruta = b.celulas[k]!;
      if (bruta === null) {
        linhas[i]![coluna] = null;
        return;
      }
      const v = decisao.converter(bruta);
      let final: Celula;
      if (v === undefined) {
        final = typeof bruta === 'string' ? bruta : String(bruta);
        perfil.inconsistencias++;
        if (perfil.exemplosInconsistencia.length < LIMITE_EXEMPLOS)
          perfil.exemplosInconsistencia.push({ linha: b.linha, valor: String(bruta).slice(0, 80) });
      } else {
        final = v;
        if (final !== bruta) perfil.convertidas++;
      }
      linhas[i]![coluna] = final;
      const chave = String(final);
      if (distintos.size < 10_000) distintos.add(chave);
      if (perfil.exemplos.length < LIMITE_EXEMPLOS && !perfil.exemplos.includes(chave)) perfil.exemplos.push(chave.slice(0, 60));
    });
    perfil.distintos = distintos.size;
    return perfil;
  });

  let duplicadas = 0;
  const assinaturas = new Set<string>();
  for (const l of linhas) {
    const s = JSON.stringify(cabecalhos.map((h) => l[h]));
    if (assinaturas.has(s)) duplicadas++;
    else assinaturas.add(s);
  }

  return { nome: limparTexto(aba.nome) || 'Aba', cabecalhos, linhas, colunas, descartadas, duplicadas };
}

/** Recusa requisições grandes demais antes de gastar CPU (proteção contra negação de serviço). */
export function validarVolume(arquivos: Array<{ abas: AbaImportacaoInput[] }>): string | null {
  let celulas = 0;
  for (const a of arquivos) for (const aba of a.abas) celulas += aba.linhas.length * Math.max(1, aba.cabecalhos.length);
  return celulas > LIMITES.celulasPorRequisicao
    ? `Arquivos grandes demais para uma importação (${celulas.toLocaleString('pt-BR')} células; limite ${LIMITES.celulasPorRequisicao.toLocaleString('pt-BR')}). Divida em lotes.`
    : null;
}
