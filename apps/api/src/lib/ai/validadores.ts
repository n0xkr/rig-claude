/**
 * Validadores determinísticos compartilhados pela importação e pelo OCR. A
 * camada de IA os usa como EVIDÊNCIA para calibrar a confiança de uma leitura
 * (ver `calibrarConfianca`): um CPF com dígito verificador errado derruba a
 * confiança; um válido a reforça. Nenhum deles consulta rede ou banco.
 */

const soDigitos = (v: string) => v.replace(/\D/g, '');

export function cpfValido(cpf: string): boolean {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dig = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
}

export function cnpjValido(cnpj: string): boolean {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * pesos[i]!;
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/**
 * CNH (nº de registro, 11 dígitos). Há duas variantes publicadas do cálculo
 * dos dígitos verificadores (a "clássica" do DENATRAN, com desconto de 2, e a
 * de pesos 2..10 / 3..11 usada por bibliotecas de validação); aceitamos
 * qualquer uma — isto é só evidência de confiança, nunca motivo para descartar
 * uma leitura.
 */
export function cnhValida(cnh: string): boolean {
  const d = soDigitos(cnh);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const n = [...d].map(Number);
  const ultimos = d.slice(-2);

  // Variante clássica.
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

  // Variante de pesos 2..10 e 3..11,2.
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

/** Placa só com letras e números, em maiúsculas ("abc-1d23" → "ABC1D23"). */
export function normalizarPlaca(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export type PaisPlaca = 'BR' | 'AR' | 'UY' | 'PY' | 'CL' | 'BO';

export interface InfoPlaca {
  placa: string;
  formato:
    | 'MERCOSUL_BR'
    | 'ANTIGA_BR_OU_MERCOSUL_UY'
    | 'MERCOSUL_AR'
    | 'ANTIGA_AR'
    | 'MERCOSUL_PY'
    | 'MERCOSUL_BO'
    | 'CHILE';
  /** País mais provável primeiro (rota Uruguaiana/Paso de los Libres: BR e AR dominam). */
  candidatos: PaisPlaca[];
  pais: PaisPlaca;
}

const FORMATOS_PLACA: Array<{ re: RegExp; formato: InfoPlaca['formato']; candidatos: PaisPlaca[] }> = [
  { re: /^[A-Z]{3}\d[A-Z]\d{2}$/, formato: 'MERCOSUL_BR', candidatos: ['BR'] },
  { re: /^[A-Z]{3}\d{4}$/, formato: 'ANTIGA_BR_OU_MERCOSUL_UY', candidatos: ['BR', 'UY'] },
  { re: /^[A-Z]{2}\d{3}[A-Z]{2}$/, formato: 'MERCOSUL_AR', candidatos: ['AR'] },
  { re: /^[A-Z]{3}\d{3}$/, formato: 'ANTIGA_AR', candidatos: ['AR'] },
  { re: /^[A-Z]{4}\d{3}$/, formato: 'MERCOSUL_PY', candidatos: ['PY'] },
  { re: /^[A-Z]{2}\d{5}$/, formato: 'MERCOSUL_BO', candidatos: ['BO'] },
  { re: /^([A-Z]{4}\d{2}|[A-Z]{2}\d{4})$/, formato: 'CHILE', candidatos: ['CL'] },
];

/** País provável de uma placa pelo formato; null se não for um formato conhecido. */
export function paisDaPlaca(texto: string): InfoPlaca | null {
  const placa = normalizarPlaca(texto);
  for (const f of FORMATOS_PLACA) {
    if (f.re.test(placa)) return { placa, formato: f.formato, candidatos: f.candidatos, pais: f.candidatos[0]! };
  }
  return null;
}

/** Placa brasileira válida (Mercosul ou antiga). */
export function placaBrasileiraValida(texto: string): boolean {
  const p = normalizarPlaca(texto);
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p);
}
