/**
 * Validação e normalização de documentos brasileiros (CPF, CNH, RENAVAM,
 * placa, chassi, categoria, datas) e dos ARQUIVOS enviados (base64 e
 * assinatura binária). Funções puras, sem Node nem DOM: a API usa no OCR e no
 * upload; o navegador usa no formulário (mesmas regras nas duas pontas).
 *
 * Os dígitos verificadores são EVIDÊNCIA: um CPF que não confere vira
 * "confira" (nunca é aplicado em silêncio); um que confere reforça a leitura.
 */

// ---------------------------------------------------------------------------
// Dígitos e documentos numéricos
// ---------------------------------------------------------------------------

/**
 * Só os dígitos. Números (a IA às vezes devolve `cpf: 1234567890`) são
 * convertidos sem notação científica; os zeros à esquerda perdidos são
 * repostos por `digitosDocumento`.
 */
export function soDigitos(v: unknown): string {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(Math.abs(v)).toString() : '';
  if (typeof v === 'string') return v.replace(/\D/g, '');
  return '';
}

/** Dígitos de um documento de tamanho fixo; repõe zeros à esquerda quando o valor veio como número. */
export function digitosDocumento(v: unknown, tamanho: number): string | null {
  const d = soDigitos(v);
  if (!d) return null;
  if (typeof v === 'number' && d.length < tamanho) return d.padStart(tamanho, '0');
  return d;
}

const repetido = (d: string) => /^(\d)\1+$/.test(d);

export function cpfValido(cpf: string): boolean {
  const d = soDigitos(cpf);
  if (d.length !== 11 || repetido(d)) return false;
  const dig = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
}

/** "52998224725" → "529.982.247-25" (parcial enquanto digita). */
export function formatarCpf(v: string): string {
  const d = soDigitos(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

/**
 * Nº de registro da CNH (11 dígitos). Há duas variantes publicadas do cálculo
 * dos dígitos verificadores (a clássica, com "desconto" de 2, e a de pesos
 * 2..10 / 3..11); aceitamos qualquer uma. Resultado é só evidência.
 */
export function cnhRegistroValido(cnh: string): boolean {
  const d = soDigitos(cnh);
  if (d.length !== 11 || repetido(d)) return false;
  const n = [...d].map(Number);
  const ultimos = d.slice(-2);

  let soma = 0;
  for (let i = 0, j = 9; i < 9; i++, j--) soma += n[i]! * j;
  let dv1 = soma % 11;
  let desconto = 0;
  if (dv1 >= 10) {
    dv1 = 0;
    desconto = 2;
  }
  soma = 0;
  for (let i = 0, j = 1; i < 9; i++, j++) soma += n[i]! * j;
  const x = soma % 11;
  const dv2 = x >= 10 ? 0 : x - desconto;
  if (`${dv1}${dv2}` === ultimos) return true;

  const paraDv = (s: number) => (s % 11 < 2 ? 0 : 11 - (s % 11));
  let s1 = 0;
  for (let i = 0; i < 9; i++) s1 += n[i]! * (i + 2);
  const v1 = paraDv(s1);
  const pesos2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 2];
  const base2 = [...n.slice(0, 9), v1];
  let s2 = 0;
  for (let i = 0; i < 10; i++) s2 += base2[i]! * pesos2[i]!;
  return `${v1}${paraDv(s2)}` === ultimos;
}

/**
 * RENAVAM (11 dígitos; os antigos de 9 recebem zeros à esquerda): os 10
 * primeiros, invertidos, × [2,3,4,5,6,7,8,9,2,3]; DV = (soma·10) mod 11, e 10 vira 0.
 */
export function renavamValido(renavam: string): boolean {
  const bruto = soDigitos(renavam);
  if (bruto.length < 9 || bruto.length > 11) return false;
  const d = bruto.padStart(11, '0');
  if (repetido(d)) return false;
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3];
  const invertidos = d.slice(0, 10).split('').reverse();
  let soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(invertidos[i]) * pesos[i]!;
  const dv = (soma * 10) % 11;
  return (dv === 10 ? 0 : dv) === Number(d[10]);
}

/** RENAVAM com 11 dígitos (completa os antigos) e se o DV confere. */
export function normalizarRenavam(v: unknown): { renavam: string | null; valido: boolean } {
  const d = soDigitos(v);
  if (d.length < 9 || d.length > 11) return { renavam: d || null, valido: false };
  const renavam = d.padStart(11, '0');
  return { renavam, valido: renavamValido(renavam) };
}

// ---------------------------------------------------------------------------
// Placa (antiga e Mercosul) e chassi
// ---------------------------------------------------------------------------

const RE_PLACA_BR = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;

export type FormatoPlacaBr = 'MERCOSUL' | 'ANTIGA';

/** Placa brasileira (antiga AAA9999 ou Mercosul AAA9A99), já normalizada. */
export function placaBrValida(placa: string): boolean {
  return RE_PLACA_BR.test(placa);
}

export function formatoPlacaBr(placa: string): FormatoPlacaBr | null {
  if (/^[A-Z]{3}\d[A-Z]\d{2}$/.test(placa)) return 'MERCOSUL';
  if (/^[A-Z]{3}\d{4}$/.test(placa)) return 'ANTIGA';
  return null;
}

// Confusões típicas de OCR, aplicadas só na posição que exige letra ou dígito.
const LETRA_DE_DIGITO: Readonly<Record<string, string>> = {
  '0': 'O',
  '1': 'I',
  '2': 'Z',
  '4': 'A',
  '5': 'S',
  '6': 'G',
  '7': 'T',
  '8': 'B',
};
const DIGITO_DE_LETRA: Readonly<Record<string, string>> = {
  O: '0',
  Q: '0',
  D: '0',
  I: '1',
  L: '1',
  Z: '2',
  A: '4',
  S: '5',
  G: '6',
  T: '7',
  B: '8',
};

export interface PlacaLida {
  /** Placa normalizada (corrigida quando a correção a torna válida); null se vazia. */
  placa: string | null;
  valida: boolean;
  /** true quando a correção posicional (O/0, I/1, B/8, S/5...) foi aplicada. */
  corrigida: boolean;
  formato: FormatoPlacaBr | null;
}

/**
 * Normaliza a placa lida (maiúsculas, sem hífen/espaço) e, se ela não for
 * válida, tenta a correção posicional: posições 1-3 são letras e 4, 6 e 7 são
 * dígitos (a 5ª pode ser os dois). Só aceita a correção se o resultado for
 * uma placa válida — senão devolve o texto original como inválido.
 */
export function normalizarPlacaLida(v: unknown): PlacaLida {
  const s = (typeof v === 'string' || typeof v === 'number' ? String(v) : '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return { placa: null, valida: false, corrigida: false, formato: null };
  if (placaBrValida(s)) return { placa: s, valida: true, corrigida: false, formato: formatoPlacaBr(s) };
  if (s.length === 7) {
    const c = s.split('');
    for (const i of [0, 1, 2]) c[i] = LETRA_DE_DIGITO[c[i]!] ?? c[i]!;
    for (const i of [3, 5, 6]) c[i] = DIGITO_DE_LETRA[c[i]!] ?? c[i]!;
    const corrigida = c.join('');
    if (placaBrValida(corrigida)) {
      return { placa: corrigida, valida: true, corrigida: true, formato: formatoPlacaBr(corrigida) };
    }
  }
  return { placa: s, valida: false, corrigida: false, formato: null };
}

/** A mesma placa no outro formato (antiga ↔ Mercosul: 5ª posição 0→A ... 9→J). */
export function placaEquivalente(placa: string): string | null {
  const p = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!placaBrValida(p)) return null;
  const quinta = p[4]!;
  const LETRAS = 'ABCDEFGHIJ';
  if (/\d/.test(quinta)) return `${p.slice(0, 4)}${LETRAS[Number(quinta)]}${p.slice(5)}`;
  const idx = LETRAS.indexOf(quinta);
  return idx >= 0 ? `${p.slice(0, 4)}${idx}${p.slice(5)}` : null;
}

/** Duas grafias da mesma placa? Tolera hífen/caixa e a conversão antiga ↔ Mercosul. */
export function placasEquivalentes(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = (a ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nb = (b ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!na || !nb) return false;
  return na === nb || placaEquivalente(na) === nb;
}

/** Chassi (VIN): 17 caracteres sem I, O e Q — as confusões O/Q→0 e I→1 são corrigidas. */
export function normalizarChassi(v: unknown): { chassi: string | null; valido: boolean } {
  const s = (typeof v === 'string' ? v : '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return { chassi: null, valido: false };
  const chassi = s.replace(/[OQ]/g, '0').replace(/I/g, '1');
  return { chassi, valido: /^[A-HJ-NPR-Z0-9]{17}$/.test(chassi) && /\d/.test(chassi) };
}

// ---------------------------------------------------------------------------
// Categoria da CNH
// ---------------------------------------------------------------------------

export const CATEGORIAS_CNH = ['ACC', 'A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const;
export type CategoriaCnh = (typeof CATEGORIAS_CNH)[number];

const semAcentoMaiusculo = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

/** "CAT. HAB. AE" / "a e" / "Categoria: E" → "AE"/"E"; fora do conjunto oficial → null. */
export function normalizarCategoriaCnh(v: unknown): CategoriaCnh | null {
  if (typeof v !== 'string') return null;
  const s = semAcentoMaiusculo(v)
    .replace(/\b(CATEGORIA|CATEG|CAT|HABILITACAO|HAB|CNH)\b/g, ' ')
    .replace(/[^A-Z]/g, '');
  return (CATEGORIAS_CNH as readonly string[]).includes(s) ? (s as CategoriaCnh) : null;
}

/** Cavalo + carreta (combinação com mais de 6 t no reboque) exige a categoria E. */
export function categoriaPermiteCombinacao(categoria: string | null | undefined): boolean {
  return Boolean(categoria && categoria.toUpperCase().includes('E'));
}

// ---------------------------------------------------------------------------
// Datas (sempre "AAAA-MM-DD", calendário real, sem fuso)
// ---------------------------------------------------------------------------

const MESES: Readonly<Record<string, number>> = {
  jan: 1, janeiro: 1, enero: 1,
  fev: 2, fevereiro: 2, feb: 2, febrero: 2,
  mar: 3, marco: 3, marzo: 3,
  abr: 4, abril: 4, apr: 4,
  mai: 5, maio: 5, may: 5, mayo: 5,
  jun: 6, junho: 6, junio: 6,
  jul: 7, julho: 7, julio: 7,
  ago: 8, agosto: 8, aug: 8,
  set: 9, setembro: 9, sep: 9, septiembre: 9, setiembre: 9,
  out: 10, outubro: 10, oct: 10, octubre: 10,
  nov: 11, novembro: 11, noviembre: 11,
  dez: 12, dezembro: 12, dec: 12, dic: 12, diciembre: 12,
};

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** A data existe no calendário (31/02 não existe; 29/02 só em ano bissexto)? */
export function dataExiste(ano: number, mes: number, dia: number): boolean {
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(dia)) return false;
  if (ano < 1900 || ano > 2200 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function montarIso(ano: number, mes: number, dia: number): string | null {
  return dataExiste(ano, mes, dia) ? `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}` : null;
}

/** Ano de 2 dígitos: "30" → 2030, "45" → 1945 (pivô = ano de referência + 12). */
function anoQuatroDigitos(ano: string, anoReferencia: number): number {
  if (ano.length === 4) return Number(ano);
  const yy = Number(ano);
  return 2000 + yy > anoReferencia + 12 ? 1900 + yy : 2000 + yy;
}

/**
 * Data em formato brasileiro (ou hispânico, comum nos documentos do Mercosul)
 * → "AAAA-MM-DD", validando o calendário. Aceita dd/mm/aaaa, dd.mm.aaaa,
 * dd-mm-aa, ddmmaaaa, "12 de março de 2024", "12 MAR 2024" e ISO. Datas
 * impossíveis (31/02) → null.
 */
export function dataBrParaIso(v: unknown, opcoes: { anoReferencia?: number } = {}): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  const ref = opcoes.anoReferencia ?? new Date().getUTCFullYear();

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/);
  if (m) return montarIso(Number(m[1]), Number(m[2]), Number(m[3]));

  m = s.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4}|\d{2})$/);
  if (m) return montarIso(anoQuatroDigitos(m[3]!, ref), Number(m[2]), Number(m[1]));

  m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) return montarIso(Number(m[3]), Number(m[2]), Number(m[1]));

  const t = semAcentoMaiusculo(s).toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  m = t.match(/^(\d{1,2})\s*(?:de\s+)?([a-z]+)\s*(?:de\s+)?(\d{4}|\d{2})$/) ?? t.match(/^(\d{1,2})[/\-]([a-z]+)[/\-](\d{4}|\d{2})$/);
  if (m) {
    const mes = MESES[m[2]!];
    return mes ? montarIso(anoQuatroDigitos(m[3]!, ref), mes, Number(m[1])) : null;
  }
  return null;
}

/** "AAAA-MM-DD" → "DD/MM/AAAA" (para mensagens). */
export function isoParaBr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * Data de hoje no fuso de Brasília ("AAAA-MM-DD"). Sem isto, uma CNH que
 * vence hoje aparecia "vencida" desde as 21h do dia anterior (meia-noite UTC).
 */
export function hojeIso(agora: Date = new Date(), fuso = 'America/Sao_Paulo'): string {
  try {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(agora);
    const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? '';
    const iso = `${p('year')}-${p('month')}-${p('day')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  } catch {
    // Intl sem dados de fuso: cai no deslocamento fixo de Brasília (UTC-3, sem horário de verão desde 2019)
  }
  return new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

const paraUtc = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(a!, m! - 1, d!);
};

/** Dias de `de` até `ate` (negativo se `ate` for antes). */
export function diasEntreIso(de: string, ate: string): number {
  return Math.round((paraUtc(ate) - paraUtc(de)) / 86_400_000);
}

/** Soma anos a uma data ISO (29/02 + 1 ano → 28/02). */
export function somarAnosIso(iso: string, anos: number): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const ano = a! + anos;
  const dia = dataExiste(ano, m!, d!) ? d! : 28;
  return `${ano}-${doisDigitos(m!)}-${doisDigitos(dia)}`;
}

/** Idade completa em anos na data `hoje`. */
export function idadeEmAnos(nascimentoIso: string, hoje: string): number {
  const [an, mn, dn] = nascimentoIso.slice(0, 10).split('-').map(Number);
  const [ah, mh, dh] = hoje.slice(0, 10).split('-').map(Number);
  let idade = ah! - an!;
  if (mh! < mn! || (mh === mn && dh! < dn!)) idade--;
  return idade;
}

export interface SituacaoValidadeCnh {
  /** Dias até a validade (0 = vence hoje; negativo = vencida há N dias). */
  diasRestantes: number;
  vencida: boolean;
  /** Vence nos próximos 30 dias (inclui hoje). */
  venceEmBreve: boolean;
  /** Vencida há no máximo 30 dias (CTB art. 162, V: a infração é dirigir com ela vencida há mais de 30 dias). */
  emTolerancia: boolean;
}

/** A CNH vale até o fim do dia da validade (comparação de datas, no fuso de Brasília). */
export function situacaoValidadeCnh(validadeIso: string, hoje: string = hojeIso()): SituacaoValidadeCnh {
  const diasRestantes = diasEntreIso(hoje, validadeIso);
  const vencida = diasRestantes < 0;
  return {
    diasRestantes,
    vencida,
    venceEmBreve: !vencida && diasRestantes <= 30,
    emTolerancia: vencida && -diasRestantes <= 30,
  };
}

// ---------------------------------------------------------------------------
// Nomes
// ---------------------------------------------------------------------------

const PARTICULAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'DI', 'DEL', 'LA']);

/** Maiúsculas, sem acento, só letras e espaços simples. */
export function normalizarNomePessoa(nome: string): string {
  return semAcentoMaiusculo(nome).replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Semelhança (0 a 1) entre dois nomes de pessoa, tolerante a acento, caixa,
 * partículas (de/da/dos) e abreviação ("JOSE C SILVA" ≈ "JOSÉ CARLOS DA SILVA").
 */
export function similaridadeNomes(a: string, b: string): number {
  const ta = normalizarNomePessoa(a).split(' ').filter((t) => t && !PARTICULAS.has(t));
  const tb = normalizarNomePessoa(b).split(' ').filter((t) => t && !PARTICULAS.has(t));
  if (ta.length === 0 || tb.length === 0) return 0;
  const restantes = [...tb];
  let iguais = 0;
  for (const t of ta) {
    let i = restantes.indexOf(t);
    if (i < 0) {
      i = restantes.findIndex(
        (r) => (t.length === 1 && r.startsWith(t)) || (r.length === 1 && t.startsWith(r)),
      );
      if (i >= 0) iguais += 0.5;
    } else iguais++;
    if (i >= 0) restantes.splice(i, 1);
  }
  return Math.min(1, (2 * iguais) / (ta.length + tb.length));
}

// ---------------------------------------------------------------------------
// Arquivos: base64, assinatura binária (magic bytes), nome seguro
// ---------------------------------------------------------------------------

export const MIMES_DOCUMENTO = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const;
export type MimeDocumento = (typeof MIMES_DOCUMENTO)[number];

/** O que o modelo de visão lê (HEIC e PDF são convertidos em JPEG no navegador). */
export const MIMES_OCR: readonly MimeDocumento[] = ['image/jpeg', 'image/png', 'image/webp'];

export const EXTENSAO_POR_MIME: Readonly<Record<MimeDocumento, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

export const MIME_POR_EXTENSAO: Readonly<Record<string, MimeDocumento>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
};

const asciiEm = (b: Uint8Array, inicio: number, texto: string) => {
  if (b.length < inicio + texto.length) return false;
  for (let i = 0; i < texto.length; i++) if (b[inicio + i] !== texto.charCodeAt(i)) return false;
  return true;
};

const MARCAS_HEIC = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis']);
const MARCAS_HEIF = new Set(['mif1', 'msf1']);

/**
 * Tipo REAL do arquivo pela assinatura (magic bytes), ignorando o que o
 * cliente declarou: JPEG FF D8 FF, PNG 89 50 4E 47 0D 0A 1A 0A, WEBP
 * "RIFF....WEBP", PDF "%PDF-" (no 1º KB) e HEIC/HEIF "....ftyp<marca>".
 */
export function detectarMimePorAssinatura(b: Uint8Array): MimeDocumento | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (asciiEm(b, 0, 'RIFF') && asciiEm(b, 8, 'WEBP')) return 'image/webp';
  if (asciiEm(b, 4, 'ftyp') && b.length >= 12) {
    const marca = String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!);
    if (MARCAS_HEIC.has(marca)) return 'image/heic';
    if (MARCAS_HEIF.has(marca)) return 'image/heif';
  }
  const limite = Math.min(b.length - 5, 1024);
  for (let i = 0; i <= limite; i++) {
    if (b[i] === 0x25 && asciiEm(b, i, '%PDF-')) return 'application/pdf';
  }
  return null;
}

/** Base64 "puro" (sem prefixo data:, sem quebras de linha), com tamanho múltiplo de 4. */
export function base64Valido(b64: string): boolean {
  return b64.length > 0 && b64.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(b64);
}

/** Bytes decodificados de um base64, calculados pelo comprimento — sem decodificar. */
export function tamanhoBase64Decodificado(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

const ALFABETO_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VALOR_B64: Int16Array = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) t[ALFABETO_B64.charCodeAt(i)] = i;
  return t;
})();

/** Decodifica só o começo de um base64 (para ler a assinatura sem alocar o arquivo inteiro). */
export function decodificarPrefixoBase64(b64: string, maxBytes: number): Uint8Array {
  const chars = Math.min(b64.length - (b64.length % 4), Math.ceil(maxBytes / 3) * 4);
  const out: number[] = [];
  const valor = (i: number) => {
    const c = b64.charCodeAt(i);
    if (c === 61) return -2; // "="
    return c < 128 ? VALOR_B64[c]! : -1;
  };
  for (let i = 0; i < chars; i += 4) {
    const a = valor(i);
    const b = valor(i + 1);
    const c = valor(i + 2);
    const d = valor(i + 3);
    if (a < 0 || b < 0 || c === -1 || d === -1) break;
    out.push(((a << 2) | (b >> 4)) & 0xff);
    if (c === -2) break;
    out.push((((b & 15) << 4) | (c >> 2)) & 0xff);
    if (d === -2) break;
    out.push((((c & 3) << 6) | d) & 0xff);
  }
  return Uint8Array.from(out.slice(0, maxBytes));
}

/**
 * Nome de arquivo seguro para guardar/exibir: sem caminho, sem caracteres de
 * controle ou reservados, até 120 caracteres e com a extensão do tipo REAL.
 */
export function nomeArquivoSeguro(nome: string, mime: MimeDocumento): string {
  const base =
    (nome.split(/[\\/]/).pop() ?? '')
      .normalize('NFC')
      .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
      .replace(/\.[A-Za-z0-9]{1,5}$/, '')
      .replace(/[#%&{}$!'@+`=]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/^[.\s]+|[.\s]+$/g, '')
      .slice(0, 110) || 'documento';
  return `${base}.${EXTENSAO_POR_MIME[mime]}`;
}

export type MotivoArquivoInvalido = 'VAZIO' | 'BASE64_INVALIDO' | 'GRANDE_DEMAIS' | 'TIPO_DESCONHECIDO' | 'TIPO_NAO_PERMITIDO';

export type InspecaoArquivo =
  | {
      ok: true;
      /** Tipo pela assinatura binária (é o que vale para o Storage e para o OCR). */
      mime: MimeDocumento;
      /** O cliente declarou outro tipo (ex.: PNG renomeado para .jpg). */
      mimeDivergente: boolean;
      tamanho: number;
      extensao: string;
      nome: string;
    }
  | { ok: false; motivo: MotivoArquivoInvalido; mensagem: string };

/**
 * Valida um arquivo base64 ANTES de decodificá-lo: charset, tamanho estimado
 * pelo comprimento, assinatura binária (só os primeiros bytes) e whitelist de
 * tipos. Nunca confia no MIME declarado.
 */
export function inspecionarArquivoBase64(
  arquivo: { nome: string; mime: string; base64: string },
  opcoes: { maxBytes: number; mimesPermitidos?: readonly MimeDocumento[] },
): InspecaoArquivo {
  const rotulo = arquivo.nome.slice(0, 80) || 'arquivo';
  if (!arquivo.base64) return { ok: false, motivo: 'VAZIO', mensagem: `${rotulo} está vazio.` };
  if (!base64Valido(arquivo.base64)) {
    return { ok: false, motivo: 'BASE64_INVALIDO', mensagem: `${rotulo} não é um arquivo válido (conteúdo corrompido).` };
  }
  const tamanho = tamanhoBase64Decodificado(arquivo.base64);
  if (tamanho > opcoes.maxBytes) {
    const mb = (n: number) => (n / 1024 / 1024).toFixed(1).replace('.0', '');
    return { ok: false, motivo: 'GRANDE_DEMAIS', mensagem: `${rotulo} tem ${mb(tamanho)} MB; o limite é ${mb(opcoes.maxBytes)} MB.` };
  }
  const mime = detectarMimePorAssinatura(decodificarPrefixoBase64(arquivo.base64, 1100));
  if (!mime) {
    return { ok: false, motivo: 'TIPO_DESCONHECIDO', mensagem: `${rotulo} não é uma foto (JPG, PNG, WEBP, HEIC) nem um PDF.` };
  }
  const permitidos = opcoes.mimesPermitidos ?? MIMES_DOCUMENTO;
  if (!permitidos.includes(mime)) {
    return { ok: false, motivo: 'TIPO_NAO_PERMITIDO', mensagem: `${rotulo}: o tipo ${EXTENSAO_POR_MIME[mime].toUpperCase()} não é aceito aqui.` };
  }
  return {
    ok: true,
    mime,
    mimeDivergente: arquivo.mime.toLowerCase() !== mime,
    tamanho,
    extensao: EXTENSAO_POR_MIME[mime],
    nome: nomeArquivoSeguro(arquivo.nome, mime),
  };
}

/**
 * Remove metadados de um JPEG (APP1 = EXIF/XMP, com GPS e modelo do celular;
 * APP13 = IPTC; COM = comentários) sem recodificar a imagem. Mantém JFIF,
 * perfil de cor (APP2) e Adobe (APP14). Estrutura inesperada → devolve o
 * original intacto.
 */
export function removerMetadadosJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const partes: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  let removeu = false;
  let achouSos = false;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return bytes;
    const marcador = bytes[i + 1]!;
    if (marcador === 0xff) {
      i++;
      continue;
    }
    if (marcador === 0xda || marcador === 0xd9) {
      partes.push(bytes.subarray(i));
      achouSos = true;
      break;
    }
    if ((marcador >= 0xd0 && marcador <= 0xd7) || marcador === 0x01) {
      partes.push(bytes.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const tamanho = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (tamanho < 2 || i + 2 + tamanho > bytes.length) return bytes;
    if (marcador === 0xe1 || marcador === 0xed || marcador === 0xfe) removeu = true;
    else partes.push(bytes.subarray(i, i + 2 + tamanho));
    i += 2 + tamanho;
  }
  if (!achouSos || !removeu) return bytes;
  const total = partes.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Zona de leitura mecânica (MRZ, ICAO 9303 TD1) — verso da CNH modelo 2022
// ---------------------------------------------------------------------------

/** Dígito verificador ICAO: pesos 7-3-1, A=10..Z=35, "<"=0. */
export function digitoVerificadorMrz(campo: string): number {
  const pesos = [7, 3, 1];
  let soma = 0;
  for (let i = 0; i < campo.length; i++) {
    const c = campo[i]!;
    const v = /\d/.test(c) ? Number(c) : /[A-Z]/.test(c) ? c.charCodeAt(0) - 55 : 0;
    soma += v * pesos[i % 3]!;
  }
  return soma % 10;
}

export interface MrzTd1 {
  /** Datas cujo dígito verificador confere (as demais ficam null). */
  nascimento: string | null;
  validade: string | null;
  /** "SOBRENOME NOMES" (a MRZ corta nomes longos — use só para conferir). */
  nome: string | null;
  digitosConferem: { nascimento: boolean; validade: boolean };
}

/**
 * Lê uma MRZ TD1 (3 linhas × 30). Aceita as linhas soltas ou coladas e
 * ignora espaços. Só devolve as datas cujo dígito verificador confere — é
 * evidência forte (a chance de um erro de leitura passar no DV é de 1 em 10).
 */
export function lerMrzTd1(linhas: readonly string[] | string, anoReferencia = new Date().getUTCFullYear()): MrzTd1 | null {
  const texto = (Array.isArray(linhas) ? linhas.join('') : String(linhas)).toUpperCase().replace(/[^A-Z0-9<]/g, '');
  if (texto.length !== 90) return null;
  const l2 = texto.slice(30, 60);
  const l3 = texto.slice(60, 90);
  const data = (yymmdd: string, nascimento: boolean): string | null => {
    if (!/^\d{6}$/.test(yymmdd)) return null;
    const yy = Number(yymmdd.slice(0, 2));
    const ano = nascimento ? (2000 + yy > anoReferencia ? 1900 + yy : 2000 + yy) : 2000 + yy;
    return montarIso(ano, Number(yymmdd.slice(2, 4)), Number(yymmdd.slice(4, 6)));
  };
  const nasc = l2.slice(0, 6);
  const val = l2.slice(8, 14);
  const confNasc = /\d/.test(l2[6]!) && digitoVerificadorMrz(nasc) === Number(l2[6]);
  const confVal = /\d/.test(l2[14]!) && digitoVerificadorMrz(val) === Number(l2[14]);
  const [sobrenome, nomes] = l3.split('<<');
  const nome = [sobrenome, nomes]
    .map((p) => (p ?? '').replace(/</g, ' ').trim())
    .filter(Boolean)
    .join(' ');
  return {
    nascimento: confNasc ? data(nasc, true) : null,
    validade: confVal ? data(val, false) : null,
    nome: nome || null,
    digitosConferem: { nascimento: confNasc, validade: confVal },
  };
}
