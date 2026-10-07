import { createHash } from 'node:crypto';

/** Remove acentos, minúsculas, e reduz qualquer pontuação a um espaço ("★Nome do motorista" -> "nome do motorista"). */
export function normTexto(t: unknown): string {
  return String(t ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Placa brasileira antiga (ABC1234) ou Mercosul (ABC1D23). */
export const PLACA_RE = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;

/** Devolve a placa em maiúsculas sem espaço/hífen quando o valor É uma placa válida; senão `null`. */
export function comoPlaca(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const p = v.replace(/[\s-]+/g, '').toUpperCase();
  return PLACA_RE.test(p) ? p : null;
}

export function hashCurto(v: unknown): string {
  return createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 16);
}

export type TipoCampo = 'text' | 'int' | 'number' | 'date' | 'sn' | 'plate';

export type Leitura = { ok: true; valor: unknown } | { ok: false; motivo: string };

const VAZIOS = new Set(['', 'a definir', 'n/a', 'na', '-', '—', 'nao se aplica', 'não se aplica']);

/** Célula sem informação real (vazia ou marcador "A DEFINIR"/"N/A"): nunca vira valor cadastrado. */
export function celulaVazia(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === 'string') return VAZIOS.has(raw.trim().toLowerCase());
  return false;
}

function dataValida(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Aceita 'YYYY-MM-DD[THH:mm[:ss]]' (sem fuso), 'dd/mm/aaaa' e serial do Excel. Nunca "adivinha" formatos ambíguos. */
function lerData(raw: unknown): string | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 1 || raw > 80000) return null;
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86400000);
    return dataValida(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (m) return dataValida(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/);
  if (m) return dataValida(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

function lerNumero(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^-?[\d.]+(,\d+)?$|^-?\d+(\.\d+)?$/.test(s)) return null;
  // "1.234,56" (pt-BR) ou "1234.56"
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Converte a célula para o tipo do campo. Valor não reconhecido => `ok:false` (a IA guarda o texto original como informação extra e avisa, em vez de supor). */
export function lerValor(raw: unknown, tipo: TipoCampo): Leitura {
  if (celulaVazia(raw)) return { ok: true, valor: undefined };
  switch (tipo) {
    case 'text':
      return { ok: true, valor: String(raw).trim() };
    case 'plate': {
      const p = comoPlaca(raw);
      return p
        ? { ok: true, valor: p }
        : { ok: false, motivo: `"${String(raw)}" não tem formato de placa` };
    }
    case 'int':
    case 'number': {
      const n = lerNumero(raw);
      if (n === null) return { ok: false, motivo: `"${String(raw)}" não é um número` };
      return { ok: true, valor: tipo === 'int' ? Math.round(n) : n };
    }
    case 'date': {
      const d = lerData(raw);
      return d
        ? { ok: true, valor: d }
        : { ok: false, motivo: `"${String(raw)}" não é uma data reconhecida` };
    }
    case 'sn': {
      const t = normTexto(raw);
      if (['sim', 's', 'true', '1', 'yes'].includes(t)) return { ok: true, valor: true };
      if (['nao', 'n', 'false', '0', 'no'].includes(t)) return { ok: true, valor: false };
      return { ok: false, motivo: `"${String(raw)}" não é Sim/Não` };
    }
  }
}

/** Valor "solto" (para informações extras/evidência): células de data já chegam como ISO do navegador. */
export function valorBruto(raw: unknown): string | number | boolean | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    return t === '' ? null : t;
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') return raw;
  return String(raw);
}

/** Igualdade tolerante usada para decidir se um registro existente mudou (evita pedidos de atualização vazios). */
export function iguais(a: unknown, b: unknown): boolean {
  const vazio = (v: unknown) => v === undefined || v === null || v === '';
  if (vazio(a) || vazio(b)) return vazio(a) && vazio(b);
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
  const numerico = (v: unknown) =>
    typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()));
  if (numerico(a) && numerico(b)) return Number(a) === Number(b);
  return String(a).trim() === String(b).trim();
}
