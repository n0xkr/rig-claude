import type {
  AbaImportacaoInput,
  AbaInterpretada,
  ColunaInterpretada,
  TipoAbaImportacao,
} from '@rigabras/shared';
import { normTexto } from '../../iaSolicitacoes/leitura.js';

/**
 * Placa brasileira (ABC1234 / ABC1D23) ou de outro país do Mercosul (AB123CD,
 * AAA123...): 6 a 8 letras/números, com letras E números. Espaço e hífen são
 * ignorados ("IYB-5C34" -> "IYB5C34").
 */
export function comoPlaca(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const p = String(v).replace(/[\s.-]+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{6,8}$/.test(p)) return null;
  const letras = p.replace(/[^A-Z]/g, '').length;
  const digitos = p.replace(/[^0-9]/g, '').length;
  return letras >= 2 && digitos >= 2 ? p : null;
}
import {
  CAMPOS_POR_TIPO,
  campoDef,
  dicaPeloNome,
  mapearColunas,
  type Mapeamento,
  type TipoValor,
} from './dicionario.js';

export type TipoDados = Exclude<TipoAbaImportacao, 'ignorada'>;

/** Linha já traduzida para campos do sistema. */
export interface Registro {
  arquivo: string;
  aba: string;
  linha: number;
  campos: Record<string, unknown>;
  /** Colunas sem campo próprio: guardadas como informação extra. */
  extras: Record<string, unknown>;
}

export interface AbaLida {
  info: AbaInterpretada;
  tipo: TipoAbaImportacao;
  registros: Registro[];
}

/** Requisitos mínimos para uma aba ser de cada tipo (evita confundir cadastros parecidos). */
function aceita(tipo: TipoDados, m: Mapeamento): boolean {
  const tem = (c: string) => m.campos.has(c);
  switch (tipo) {
    case 'viagens':
      return (
        tem('placa_cavalo') &&
        [
          'origem', 'destino', 'status_texto', 'numero_crt', 'numero_danfe', 'codigo_externo',
          'motorista_nome', 'data_programacao', 'cliente', 'mercadoria',
        ].filter(tem).length >= 2
      );
    case 'veiculos':
      return (
        tem('placa') &&
        ['tipo_desc', 'tipo_unidade', 'marca', 'modelo', 'ano_fabricacao', 'km_atual', 'situacao', 'crlv_validade', 'capacidade_kg'].filter(tem).length >= 2
      );
    case 'motoristas':
      return (
        tem('nome_completo') &&
        ['cnh', 'cpf', 'cnh_validade', 'cnh_categoria', 'telefone', 'codigo_externo', 'vinculo'].filter(tem).length >= 2
      );
    case 'clientes':
      return tem('nome') && ['documento', 'pais', 'codigo_externo', 'contato'].filter(tem).length >= 1;
    case 'cargas':
      return tem('numero_documento') && (tem('viagem_ref') || tem('placa'));
    case 'checklists':
    case 'smp':
      return tem('resultado') && (tem('viagem_ref') || tem('placa'));
    case 'consultas':
      return tem('resultado') && (tem('alvo') || tem('alvo_nome') || tem('placa'));
  }
}

const TIPOS: TipoDados[] = [
  'viagens', 'veiculos', 'motoristas', 'clientes', 'cargas', 'checklists', 'smp', 'consultas',
];

/**
 * Decide o tipo da aba: o nome da aba é uma dica forte ("VEICULOS",
 * "FOLLOWUP"); sem dica, vence o tipo cujo dicionário melhor explica os
 * cabeçalhos e cumpre os requisitos mínimos. `null` = não reconhecida
 * (a IA ainda pode opinar).
 */
export function classificarAba(
  aba: AbaImportacaoInput,
): { tipo: TipoAbaImportacao; mapa: Mapeamento | null; origem: 'dicionario' | 'nome' } | null {
  const dica = dicaPeloNome(aba.nome);
  const mapas = new Map(TIPOS.map((t) => [t, mapearColunas(t, aba.cabecalhos)]));
  if (dica === 'ignorada') return { tipo: 'ignorada', mapa: null, origem: 'nome' };
  if (dica && aceita(dica, mapas.get(dica)!))
    return { tipo: dica, mapa: mapas.get(dica)!, origem: 'nome' };
  const candidatos = TIPOS.filter((t) => aceita(t, mapas.get(t)!)).sort(
    (a, b) => mapas.get(b)!.pontos - mapas.get(a)!.pontos,
  );
  const melhor = candidatos[0];
  return melhor ? { tipo: melhor, mapa: mapas.get(melhor)!, origem: 'dicionario' } : null;
}

// ---------------------------------------------------------------------------
// Leitura de valores
// ---------------------------------------------------------------------------

const VAZIOS = new Set(['', '-', '—', 'n a', 'na', 'a definir', 'nao se aplica', 'null', 'undefined', 'x x']);

export function vazio(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return VAZIOS.has(normTexto(v)) || v.trim() === '';
  return false;
}

export function lerNumero(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  let t = raw.replace(/[^0-9.,-]/g, '');
  if (t === '' || t === '-') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Data/hora da planilha -> ISO. Datas sem fuso são tratadas como horário de Brasília (-03:00). */
export function lerDataHora(raw: unknown, soData = false): string | null {
  let y: number, m: number, d: number, H = 0, M = 0;
  if (typeof raw === 'number') {
    if (raw < 20000 || raw > 80000) return null; // serial do Excel entre ~1954 e ~2119
    const ms = Date.UTC(1899, 11, 30) + raw * 86400000;
    const dt = new Date(ms);
    [y, m, d, H, M] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), dt.getUTCHours(), dt.getUTCMinutes()];
  } else if (typeof raw === 'string') {
    const s = raw.trim();
    let r = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/);
    if (r) {
      [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
      if (r[4]) [H, M] = [Number(r[4]), Number(r[5])];
      if (/Z$|[+-]\d{2}:\d{2}$/.test(s) && !soData) {
        const dt = new Date(s);
        return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
      }
    } else {
      r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s+(\d{1,2})[:h](\d{2}))?/);
      if (!r) return null;
      [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
      if (y < 100) y += 2000;
      if (r[4]) [H, M] = [Number(r[4]), Number(r[5])];
    }
  } else return null;
  if (y! < 1950 || y! > 2100 || m! < 1 || m! > 12 || d! < 1 || d! > 31) return null;
  const dia = `${y!}-${pad(m!)}-${pad(d!)}`;
  if (soData) return dia;
  return new Date(`${dia}T${pad(H)}:${pad(M)}:00-03:00`).toISOString();
}

export function lerBool(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw === 1 ? true : raw === 0 ? false : null;
  const t = normTexto(raw);
  if (!t) return null;
  if (/^(sim|s|ok|x|yes|y|true|1|feito|feita|aprovad[oa]|liberad[oa]|valid[oa]|conforme|apto|concluid[oa]|finalizad[oa]|em andamento)\b/.test(t))
    return true;
  if (/^(nao|n|no|false|0|pendente|reprovad[oa]|vencid[oa]|nao feito|nao feita|inapto|bloquead[oa]|recusad[oa])\b/.test(t))
    return false;
  return null;
}

export function lerValorTipado(raw: unknown, tipo: TipoValor): unknown {
  if (vazio(raw)) return undefined;
  switch (tipo) {
    case 'text':
      return String(raw).trim().replace(/\s+/g, ' ');
    case 'plate':
      return comoPlaca(String(raw)) ?? undefined;
    case 'number':
      return lerNumero(raw) ?? undefined;
    case 'int': {
      const n = lerNumero(raw);
      return n === null ? undefined : Math.round(n);
    }
    case 'date':
      return lerDataHora(raw, true) ?? undefined;
    case 'datetime':
      return lerDataHora(raw) ?? undefined;
    case 'bool':
      return lerBool(raw) ?? undefined;
  }
}

/** Converte as linhas de uma aba em registros, segundo o mapeamento coluna -> campo. */
export function lerRegistros(
  arquivo: string,
  aba: AbaImportacaoInput,
  tipo: TipoDados,
  porColuna: Map<string, string>,
): Registro[] {
  const out: Registro[] = [];
  aba.linhas.forEach((linha, i) => {
    const campos: Record<string, unknown> = {};
    const extras: Record<string, unknown> = {};
    let algum = false;
    for (const col of aba.cabecalhos) {
      const raw = linha[col];
      if (vazio(raw)) continue;
      algum = true;
      const campo = porColuna.get(col);
      const def = campo ? campoDef(tipo, campo) : null;
      if (!def) {
        extras[col] = typeof raw === 'string' ? raw.trim() : raw;
        continue;
      }
      const v = lerValorTipado(raw, def.tipo);
      if (v === undefined) {
        // Valor que não entendemos (ex.: "IYB 5C3" onde se espera placa): guarda o original.
        extras[col] = raw;
        continue;
      }
      if (def.multi && typeof campos[campo!] === 'string') {
        campos[campo!] = `${campos[campo!] as string} | ${String(v)}`;
      } else if (campos[campo!] === undefined) campos[campo!] = v;
    }
    if (!algum) return;
    const numeroLinha = typeof linha.__linha === 'number' ? (linha.__linha as number) : i + 2;
    delete extras.__linha;
    out.push({ arquivo, aba: aba.nome, linha: numeroLinha, campos, extras });
  });
  return out;
}

export function descreverColunas(
  tipo: TipoAbaImportacao,
  cabecalhos: string[],
  porColuna: Map<string, string>,
  daIa: Set<string>,
): ColunaInterpretada[] {
  return cabecalhos
    .filter((c) => c !== '__linha')
    .map((coluna) => {
      const campo = porColuna.get(coluna) ?? null;
      const def = campo && tipo !== 'ignorada' ? campoDef(tipo, campo) : null;
      return {
        coluna,
        campo,
        rotulo: def?.rotulo ?? null,
        origem: tipo === 'ignorada' ? 'ignorada' : campo ? (daIa.has(coluna) ? 'ia' : 'dicionario') : 'extra',
      };
    });
}

export function camposLivres(tipo: TipoDados, usados: Set<string>) {
  return CAMPOS_POR_TIPO[tipo].filter((c) => c.multi || !usados.has(c.campo));
}
