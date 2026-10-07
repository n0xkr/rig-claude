import { cnpjValido, cpfValido } from './validadores.js';

/**
 * Mascaramento de dados pessoais (LGPD), reutilizado pela importação, pelas
 * solicitações, pelo chatbot/insights e pelos logs. Trabalha só com padrões:
 * nunca consulta banco e nunca guarda o valor original.
 */

export interface OpcoesMascara {
  /** Mantém CNPJs válidos (dado de empresa, útil para casar clientes). Padrão false. */
  preservarCnpj?: boolean;
}

const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const RE_CNPJ_FMT = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
const RE_CPF_FMT = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
/** RG com rótulo ("RG: 12.345.678-9", "Identidade 1234567 SSP/RS") ou no formato 99.999.999-X. */
const RE_RG_ROTULO = /\b(?:RG|R\.G\.|identidade|doc\.?\s*identidade)\s*[:nº°.#-]*\s*[\dXx][\dXx.\-/]{4,13}/gi;
const RE_RG_FMT = /\b\d{1,2}\.\d{3}\.\d{3}-[\dXx]\b/g;
/** Telefone com DDD: (51) 99999-9999, +55 51 3333-4444, 51 9 9999 9999. */
const RE_TELEFONE = /(?:\+?55[\s.-]?)?\(?\b\d{2}\)?[\s.-]?(?:9[\s.-]?)?\d{4}[\s.-]\d{4}\b/g;
/** Sequência longa de dígitos sem máscara (CPF, CNH, RENAVAM, celular colado...). */
const RE_DIGITOS_LONGOS = /\b\d{9,}\b/g;

/** Mascara e conta as substituições. */
export function mascararPIIComContagem(
  texto: string,
  opcoes: OpcoesMascara = {},
): { texto: string; substituicoes: number } {
  let n = 0;
  const trocar = (rotulo: string) => () => {
    n++;
    return rotulo;
  };
  let s = texto;
  s = s.replace(RE_EMAIL, trocar('[EMAIL]'));
  s = s.replace(RE_CNPJ_FMT, (m) => {
    if (opcoes.preservarCnpj && cnpjValido(m)) return m;
    n++;
    return '[CNPJ]';
  });
  s = s.replace(RE_CPF_FMT, trocar('[CPF]'));
  s = s.replace(RE_RG_ROTULO, trocar('[RG]'));
  s = s.replace(RE_RG_FMT, trocar('[RG]'));
  s = s.replace(RE_TELEFONE, trocar('[TELEFONE]'));
  s = s.replace(RE_DIGITOS_LONGOS, (m) => {
    if (m.length === 14 && opcoes.preservarCnpj && cnpjValido(m)) return m;
    n++;
    if (m.length === 11 && cpfValido(m)) return '[CPF]';
    if (m.length === 14 && cnpjValido(m)) return '[CNPJ]';
    return '[NUMERO]';
  });
  return { texto: s, substituicoes: n };
}

/** Remove CPF, CNPJ, CNH, RG, telefone, e-mail e sequências longas de dígitos de um texto livre. */
export function mascararPII(texto: string, opcoes: OpcoesMascara = {}): string {
  return mascararPIIComContagem(texto, opcoes).texto;
}

const normCabecalho = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const RE_COLUNA_SEGREDO =
  /\b(senha|password|passwd|pwd|login|username|token|secret|segredo|api ?key|apikey|chave de acesso|pin)\b/;
const RE_COLUNA_PESSOAL =
  /\b(cpf|cnh|rg|identidade|registro geral|passaporte|pis|pasep|nis|ctps|titulo de eleitor|telefone|tel|fone|celular|cel|whats|whatsapp|contato|e ?mail|email|filiacao|mae|nome da mae|pai|nome do pai|nascimento|data de nascimento|dt nasc|nasc|endereco|logradouro|residencia|cep|conta corrente|conta|agencia|pix|cartao|salario)\b/;

/**
 * Classifica um cabeçalho de planilha: "segredo" (senha/login/token — o valor
 * nunca sai daqui), "pessoal" (CPF, telefone, filiação... — vai só o formato)
 * ou null.
 */
export function classificarColunaSensivel(cabecalho: string): 'segredo' | 'pessoal' | null {
  const c = normCabecalho(cabecalho);
  if (!c) return null;
  if (RE_COLUNA_SEGREDO.test(c)) return 'segredo';
  if (RE_COLUNA_PESSOAL.test(c)) return 'pessoal';
  return null;
}

export function ehColunaSensivel(cabecalho: string): boolean {
  return classificarColunaSensivel(cabecalho) !== null;
}

/**
 * Troca um valor real pelo seu formato: "dd/mm/aaaa", "###.###.###-##",
 * "AAA9A99", "Aaaa+ Aaaa+"... Serve para a IA entender o TIPO de uma coluna
 * sensível sem ver o dado.
 */
export function perfilValor(valor: unknown): string {
  if (valor === null || valor === undefined) return 'vazio';
  if (typeof valor === 'boolean') return 'booleano';
  if (typeof valor === 'number') return Number.isFinite(valor) ? (Number.isInteger(valor) ? 'inteiro' : 'decimal') : 'vazio';
  if (valor instanceof Date) return 'data';
  if (typeof valor !== 'string') return Array.isArray(valor) ? 'lista' : 'objeto';
  const s = valor.trim();
  if (!s) return 'vazio';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return 'dd/mm/aaaa';
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(s)) return 'dd/mm/aa';
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?.*)?$/.test(s)) return s.length > 10 ? 'aaaa-mm-dd hh:mm' : 'aaaa-mm-dd';
  const compacto = s.toUpperCase().replace(/[\s-]/g, '');
  if (/^[A-Z]{3}\d[A-Z]\d{2}$/.test(compacto)) return 'AAA9A99';
  if (/^[A-Z]{3}\d{4}$/.test(compacto)) return 'AAA9999';
  if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s)) return 'email@dominio';
  const mascara = s
    .slice(0, 60)
    .replace(/\d/g, '#')
    .replace(/[A-ZÀ-ÖØ-Þ]/g, 'A')
    .replace(/[a-zß-öø-ÿ]/g, 'a')
    // Sequências longas da mesma classe viram "AAA+" (o tamanho exato também identifica).
    .replace(/([#Aa])\1{3,}/g, '$1$1$1+');
  return mascara.slice(0, 40);
}

/** Formatos distintos de uma amostra de valores (no máximo `max`). */
export function perfilAmostra(valores: readonly unknown[], max = 5): string[] {
  const vistos = new Set<string>();
  for (const v of valores) {
    const p = perfilValor(v);
    if (p === 'vazio') continue;
    vistos.add(p);
    if (vistos.size >= max) break;
  }
  return [...vistos];
}

const CHAVES_SENSIVEIS_LOG =
  /cpf|cnh|(^|_)rg($|_)|filia|mae|pai|nome|telefone|celular|fone|e-?mail|base64|imagem|image|senha|password|token|secret|conteudo|content|prompt|raw|bruto|resposta|amostra|texto|dados|pergunta|messages/i;
const RE_DATA_URL = /^data:[^;,]+;base64,/i;
const RE_BASE64_LONGO = /^[A-Za-z0-9+/=\r\n]{200,}$/;

/**
 * Redação centralizada para LOGS: chaves sensíveis viram "[REDIGIDO]", base64
 * e data URLs viram "[base64 N chars]", textos são mascarados e encurtados.
 * Nunca use o objeto original num log de IA — passe por aqui.
 */
export function redigirParaLog(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 5) return '[...]';
  if (valor === null || valor === undefined || typeof valor === 'number' || typeof valor === 'boolean') return valor;
  if (typeof valor === 'string') {
    if (RE_DATA_URL.test(valor) || RE_BASE64_LONGO.test(valor)) return `[base64 ${valor.length} chars]`;
    const m = mascararPII(valor);
    return m.length > 120 ? `${m.slice(0, 120)}…[${m.length} chars]` : m;
  }
  if (Array.isArray(valor)) {
    const itens = valor.slice(0, 10).map((v) => redigirParaLog(v, profundidade + 1));
    return valor.length > 10 ? [...itens, `[+${valor.length - 10} itens]`] : itens;
  }
  if (valor instanceof Error) return { name: valor.name, message: redigirParaLog(valor.message, profundidade + 1) };
  if (typeof valor === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>).slice(0, 40)) {
      out[k] = CHAVES_SENSIVEIS_LOG.test(k) ? '[REDIGIDO]' : redigirParaLog(v, profundidade + 1);
    }
    return out;
  }
  return String(typeof valor);
}
