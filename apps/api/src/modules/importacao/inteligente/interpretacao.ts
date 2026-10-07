import { statusViagemDeTexto } from '@rigabras/shared';
import type {
  AbaInterpretada,
  ColunaInterpretada,
  TipoAbaImportacao,
} from '@rigabras/shared';
import { normTexto } from '../../iaSolicitacoes/leitura.js';

// Placas: uma só implementação, a da padronização (usada também pela consolidação).
import { comoPlaca, extrairPlacas, type TipoCanonico } from './padronizacao.js';
export { comoPlaca, extrairPlacas };

/** Aba já padronizada (etapa 1) — é o que a interpretação lê. */
export interface AbaLeitura {
  nome: string;
  cabecalhos: string[];
  linhas: Array<Record<string, unknown>>;
}

/** "09:00", "9h30", "1899-12-30T09:00" (hora do Excel) ou fração do dia (0.375) -> [H, M]. */
export function lerHora(raw: unknown): [number, number] | null {
  if (typeof raw === 'number') {
    if (raw < 0 || raw >= 1) return null;
    const min = Math.round(raw * 1440);
    return [Math.floor(min / 60) % 24, min % 60];
  }
  if (typeof raw !== 'string') return null;
  const r = raw.trim().match(/(?:^|T)(\d{1,2})[:h](\d{2})/);
  if (!r) return null;
  const H = Number(r[1]);
  const M = Number(r[2]);
  return H < 24 && M < 60 ? [H, M] : null;
}

/** Campo de hora separado -> campo de data/hora ao qual ele pertence (viagens). */
export const PARES_DATA_HORA: Array<{ data: string; hora: string; rotulo: string }> = [
  { data: 'data_programacao', hora: 'hora_programacao', rotulo: 'Hora de início / carregamento (previsto)' },
  { data: 'data_ordem_coleta', hora: 'hora_ordem_coleta', rotulo: 'Hora da ordem de coleta' },
  { data: 'data_coleta', hora: 'hora_coleta', rotulo: 'Hora da coleta' },
  { data: 'data_inicio_viagem', hora: 'hora_inicio_viagem', rotulo: 'Hora do início real da viagem' },
  { data: 'data_chegada_fronteira', hora: 'hora_chegada_fronteira', rotulo: 'Hora da chegada na fronteira' },
  { data: 'data_liberacao_fronteira', hora: 'hora_liberacao_fronteira', rotulo: 'Hora da liberação na fronteira' },
  { data: 'data_entrega', hora: 'hora_entrega', rotulo: 'Hora da chegada' },
  { data: 'data_encerramento', hora: 'hora_encerramento', rotulo: 'Hora do encerramento' },
];

/**
 * Junta a coluna de hora separada ("Data Coleta" + "Hora") na data/hora do campo. Hora sem a
 * data correspondente não se perde: vira informação extra ("HH:mm") com o rótulo do campo.
 */
function aplicarHora(
  campos: Record<string, unknown>,
  extras: Record<string, unknown>,
  campoData: string,
  campoHora: string,
  rotulo: string,
) {
  const hora = campos[campoHora];
  delete campos[campoHora];
  if (hora === undefined) return;
  const hm = lerHora(hora);
  if (!hm) {
    extras[rotulo] = hora;
    return;
  }
  const data = campos[campoData];
  if (typeof data !== 'string') {
    extras[rotulo] = `${String(hm[0]).padStart(2, '0')}:${String(hm[1]).padStart(2, '0')}`;
    return;
  }
  // A data já está em ISO (UTC); pega o dia em horário de Brasília e aplica a hora da planilha.
  const local = new Date(Date.parse(data) - 3 * 3600000);
  if (Number.isNaN(local.getTime())) return;
  const dia = local.toISOString().slice(0, 10);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  campos[campoData] = new Date(`${dia}T${pad2(hm[0])}:${pad2(hm[1])}:00-03:00`).toISOString();
}
import {
  CAMPOS_POR_TIPO,
  campoDef,
  dicaPeloNome,
  ehAuxiliar,
  ehExtraConhecido,
  mapearColunas,
  pontuar,
  type CampoImport,
  type Mapeamento,
  type TipoValor,
} from './dicionario.js';

export type TipoDados = Exclude<TipoAbaImportacao, 'ignorada'>;

/** Sugestão (da IA) que NÃO foi aplicada por estar abaixo do limiar: fica para revisão humana. */
export interface SugestaoColuna {
  campo: string;
  rotulo: string | null;
  confianca: number;
  motivo?: string;
}

/**
 * Coluna como a prévia mostra: além do contrato do shared, a confiança do mapeamento (0..1),
 * o motivo e, quando a IA sugeriu um campo com pouca certeza, a sugestão não aplicada.
 * Campos opcionais: o contrato HTTP continua compatível com `ColunaInterpretada`.
 */
export interface ColunaInterpretadaDetalhada extends ColunaInterpretada {
  confianca?: number;
  motivo?: string;
  sugestao?: SugestaoColuna;
}

export interface AbaInterpretadaDetalhada extends AbaInterpretada {
  colunas: ColunaInterpretadaDetalhada[];
  /** Confiança do tipo da aba (0..1) e de onde ela veio. */
  confianca?: number;
  motivo?: string;
  /** Tipo sugerido pela IA mas não aplicado (falta coluna obrigatória ou confiança baixa). */
  sugestao?: { tipo: TipoAbaImportacao; confianca: number; motivo?: string };
  /** Total real de linhas descartadas quando a lista `descartadas` foi encurtada. */
  descartadas_total?: number;
}

/** Detalhe de confiança por coluna, calculado antes de `descreverColunas`. */
export interface DetalheColuna {
  confianca?: number;
  motivo?: string;
  sugestao?: SugestaoColuna;
}

/** Linha já traduzida para campos do sistema. */
export interface Registro {
  arquivo: string;
  aba: string;
  linha: number;
  campos: Record<string, unknown>;
  /** Colunas sem campo próprio: guardadas como informação extra. */
  extras: Record<string, unknown>;
  /** Viagem montada a partir do retrato diário da própria frota (ver retratos.ts). */
  retrato?: boolean;
}

export interface AbaLida {
  info: AbaInterpretadaDetalhada;
  tipo: TipoAbaImportacao;
  registros: Registro[];
}

/** Requisitos mínimos para uma aba ser de cada tipo (evita confundir cadastros parecidos). */
function aceita(tipo: TipoDados, m: Mapeamento, peloNome = false): boolean {
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
        [
          'tipo_desc', 'tipo_unidade', 'marca', 'modelo', 'ano_fabricacao', 'km_atual', 'situacao', 'crlv_validade',
          'capacidade_kg', 'tacografo_validade', 'inspecao_tecnica_validade', 'rntrc_validade', 'rntrc_numero',
          'ultima_manutencao_data', 'proxima_manutencao_data',
        ].filter(tem).length >= (peloNome ? 1 : 2)
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

/**
 * Sem coluna de cliente, uma coluna de observações (ou sem nome conhecido) cujo conteúdo é
 * uma lista curta de nomes que se repetem ("GONVARRI", "FERROSIDER"...) em muitas linhas é,
 * na prática, o cliente da viagem.
 */
function promoverColunaDeCliente(aba: AbaLeitura, m: Mapeamento) {
  if (m.campos.has('cliente')) return;
  for (const col of aba.cabecalhos) {
    const campo = m.porColuna.get(col);
    if (campo && campo !== 'observacoes') continue;
    if (ehExtraConhecido(col)) continue; // "Tipo de veículo", fatura, lote...
    const valores = aba.linhas.map((l) => l[col]).filter((v) => typeof v === 'string' && !vazio(v)) as string[];
    if (valores.length < 20) continue;
    const distintos = [...new Set(valores.map((v) => normTexto(v)))];
    if (distintos.length > Math.max(8, valores.length * 0.05)) continue;
    if (distintos.some((d) => d.length > 40 || /^\d+$/.test(d) || !/[a-z]{3}/.test(d))) continue;
    if (distintos.filter((d) => statusViagemDeTexto(d)).length > distintos.length * 0.2) continue;
    m.porColuna.set(col, 'cliente');
    m.campos.add('cliente');
    if (campo === 'observacoes' && ![...m.porColuna.values()].includes('observacoes')) m.campos.delete('observacoes');
    return;
  }
}

/**
 * Aba de frota sem coluna chamada "placa" (ex.: a coluna das placas se chama "FROTA" ou está
 * sem título): a coluna em que quase todo valor é uma placa é a placa.
 */
function promoverColunaDePlaca(aba: AbaLeitura, m: Mapeamento) {
  if (m.campos.has('placa')) return;
  for (const col of aba.cabecalhos) {
    if (col === '__linha' || m.porColuna.has(col)) continue;
    const valores = aba.linhas.map((l) => l[col]).filter((v) => !vazio(v));
    if (valores.length < 3) continue;
    const placas = valores.filter((v) => comoPlaca(v)).length;
    if (placas / valores.length < 0.8) continue;
    m.porColuna.set(col, 'placa');
    m.campos.add('placa');
    return;
  }
}

/**
 * Abas de um assunto só (revisão técnica, cronotacógrafo, licenciamento): "Data da Validade" e
 * "Status" são DAQUELE documento, não do veículo nem da manutenção.
 */
function ajustarPeloAssuntoDaAba(nomeAba: string, aba: AbaLeitura, m: Mapeamento) {
  const n = ` ${normTexto(nomeAba)} `;
  const assunto = / revisao tecnica | inspecao | vistoria /.test(n)
    ? 'inspecao_tecnica_validade'
    : / cronotacografo | tacografo /.test(n)
      ? 'tacografo_validade'
      : / licenciamento | crlv /.test(n)
        ? 'crlv_validade'
        : null;
  if (!assunto) return;
  for (const col of aba.cabecalhos) {
    const c = normTexto(col);
    const campo = m.porColuna.get(col);
    // Situação/manutenção lidas de uma aba de documento viram informação extra.
    if (campo === 'situacao' || campo === 'ultima_manutencao_data' || campo === 'proxima_manutencao_data' || campo === 'capacidade_kg') {
      m.porColuna.delete(col);
      m.campos.delete(campo);
    }
    if (!m.campos.has(assunto) && /\b(validade|vencimento|vence)\b/.test(c) && !/\b(alerta|dias)\b/.test(c)) {
      if (campo) m.campos.delete(campo);
      m.porColuna.set(col, assunto);
      m.campos.add(assunto);
    }
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
  aba: AbaLeitura,
): { tipo: TipoAbaImportacao; mapa: Mapeamento | null; origem: 'dicionario' | 'nome' } | null {
  const dica = dicaPeloNome(aba.nome);
  const cabecalhos = aba.cabecalhos.filter((c) => !ehAuxiliar(c));
  const mapas = new Map(TIPOS.map((t) => [t, mapearColunas(t, cabecalhos)]));
  promoverColunaDeCliente(aba, mapas.get('viagens')!);
  if (dica === 'veiculos') promoverColunaDePlaca(aba, mapas.get('veiculos')!);
  ajustarPeloAssuntoDaAba(aba.nome, aba, mapas.get('veiculos')!);
  if (dica === 'ignorada') return { tipo: 'ignorada', mapa: null, origem: 'nome' };
  if (dica && aceita(dica, mapas.get(dica)!, true))
    return { tipo: dica, mapa: mapas.get(dica)!, origem: 'nome' };
  const candidatos = TIPOS.filter((t) => aceita(t, mapas.get(t)!)).sort(
    (a, b) => mapas.get(b)!.pontos - mapas.get(a)!.pontos,
  );
  const melhor = candidatos[0];
  return melhor ? { tipo: melhor, mapa: mapas.get(melhor)!, origem: 'dicionario' } : null;
}

/** O que falta para a aba cumprir os requisitos mínimos do tipo (texto para o usuário). */
function faltaParaTipo(tipo: TipoDados, m: Mapeamento): string {
  const tem = (c: string) => m.campos.has(c);
  switch (tipo) {
    case 'viagens':
      return tem('placa_cavalo') ? 'faltam colunas de rota, cliente, documento ou status' : 'falta a coluna de placa do cavalo';
    case 'veiculos':
      return tem('placa') ? 'faltam colunas de cadastro do veículo (tipo, marca, ano, validades...)' : 'falta a coluna de placa';
    case 'motoristas':
      return tem('nome_completo') ? 'faltam colunas de documento ou contato (CPF, CNH, telefone...)' : 'falta a coluna de nome';
    case 'clientes':
      return tem('nome') ? 'faltam colunas de documento, país ou contato' : 'falta a coluna de nome';
    case 'cargas':
      return tem('numero_documento') ? 'falta a coluna da viagem ou da placa' : 'falta a coluna do nº do documento';
    case 'checklists':
    case 'smp':
      return tem('resultado') ? 'falta a coluna da viagem ou da placa' : 'falta a coluna de resultado/status';
    case 'consultas':
      return tem('resultado') ? 'falta a coluna do motorista ou da placa consultada' : 'falta a coluna de resultado';
  }
}

/**
 * Mapeamento de uma aba para um tipo JÁ decidido fora do dicionário (pela IA): passa pelas
 * MESMAS travas de `classificarAba` — ignora colunas auxiliares, aplica as promoções por
 * conteúdo (cliente/placa) e o assunto da aba, e confere os requisitos mínimos do tipo. Assim
 * uma aba que a IA chama de "veiculos" sem coluna de placa não é aceita em silêncio.
 * `cobertura` = fração das colunas com dados que ganharam um campo (evidência para a confiança).
 */
export function mapaParaTipo(
  aba: AbaLeitura,
  tipo: TipoDados,
): { mapa: Mapeamento; aceito: boolean; falta: string | null; cobertura: number } {
  const cabecalhos = aba.cabecalhos.filter((c) => c !== '__linha' && !ehAuxiliar(c));
  const mapa = mapearColunas(tipo, cabecalhos);
  if (tipo === 'viagens') promoverColunaDeCliente(aba, mapa);
  if (tipo === 'veiculos') {
    promoverColunaDePlaca(aba, mapa);
    ajustarPeloAssuntoDaAba(aba.nome, aba, mapa);
  }
  const aceito = aceita(tipo, mapa, true);
  const comDados = cabecalhos.filter((c) => aba.linhas.some((l) => !vazio(l[c])));
  const cobertura = comDados.length === 0 ? 0 : comDados.filter((c) => mapa.porColuna.has(c)).length / comDados.length;
  return { mapa, aceito, falta: aceito ? null : faltaParaTipo(tipo, mapa), cobertura: Math.round(cobertura * 1000) / 1000 };
}

/**
 * Compatibilidade entre o tipo que a padronização detectou olhando a coluna INTEIRA e o tipo do
 * campo do sistema: 1 = combina, valores intermediários = plausível, 0 = incompatível (uma
 * coluna de datas nunca vira "valor do frete"), null = sem evidência (coluna vazia/desconhecida).
 * É a evidência determinística usada para calibrar a confiança das sugestões da IA.
 */
export function compatibilidadeTipo(tipoColuna: TipoCanonico | null | undefined, campo: Pick<CampoImport, 'campo' | 'tipo'>): number | null {
  if (!tipoColuna || tipoColuna === 'vazio') return null;
  const ehHora = campo.campo.startsWith('hora_');
  switch (campo.tipo) {
    case 'plate':
      return tipoColuna === 'placa' || tipoColuna === 'placas' ? 1 : tipoColuna === 'texto' || tipoColuna === 'codigo' ? 0.3 : 0;
    case 'date':
    case 'datetime':
      return tipoColuna === 'data' || tipoColuna === 'datahora' ? 1 : tipoColuna === 'texto' ? 0.3 : 0;
    case 'number':
    case 'int':
      return tipoColuna === 'numero' ? 1 : tipoColuna === 'codigo' ? 0.3 : 0;
    case 'bool':
      return tipoColuna === 'booleano' ? 1 : tipoColuna === 'texto' ? 0.5 : 0;
    case 'text':
      if (ehHora) return tipoColuna === 'hora' ? 1 : tipoColuna === 'datahora' ? 0.6 : tipoColuna === 'texto' ? 0.4 : 0;
      if (tipoColuna === 'texto' || tipoColuna === 'codigo') return 0.8;
      if (tipoColuna === 'numero') return 0.6;
      if (tipoColuna === 'placa' || tipoColuna === 'placas') return 0.3;
      return 0.2; // hora, data, booleano num campo de texto livre: possível, mas improvável
  }
}

/**
 * Confiança de um mapeamento feito pelo dicionário (sem IA), pela força do casamento do nome:
 * nome igual a um sinônimo vale mais que "contém o sinônimo". Coluna promovida pelo conteúdo
 * (cliente/placa) ou pelo assunto da aba não casa pelo nome e recebe um valor intermediário.
 */
export function confiancaDoDicionario(tipo: TipoDados, coluna: string, campo: string): { confianca: number; motivo: string } {
  const def = campoDef(tipo, campo);
  const p = def ? pontuar(normTexto(coluna), def) : 0;
  if (p >= 90) return { confianca: 0.95, motivo: 'nome da coluna igual a um nome conhecido do campo' };
  if (p >= 50) return { confianca: 0.8, motivo: 'nome da coluna começa ou termina com um nome conhecido do campo' };
  if (p > 0) return { confianca: 0.6, motivo: 'nome da coluna contém um nome conhecido do campo' };
  return { confianca: 0.7, motivo: 'deduzida pelo conteúdo da coluna ou pelo assunto da aba' };
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

/** Abreviações de mês em português e espanhol (as planilhas da operação misturam os dois). */
const MESES: Record<string, number> = {
  jan: 1, ene: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, ago: 8, aug: 8,
  set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dic: 12, dec: 12,
};

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
        // O V8 "rola" dias inexistentes ("2024-02-31T..." vira 02/03): confere antes.
        if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
        const dt = new Date(s);
        return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
      }
    } else {
      r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s+(\d{1,2})[:h](\d{2}))?/);
      // "22.mai.2024", "24-Out-2024", "3 de março de 2025"
      const nome = r ? null : s.match(/^(\d{1,2})(?:[\s./-]+de)?[\s./-]*([A-Za-zçÇ]{3,9})\.?(?:[\s./-]+de)?[\s./-]*(\d{2,4})(?:\s+(\d{1,2})[:h](\d{2}))?/);
      if (nome) {
        const mes = MESES[normTexto(nome[2]).slice(0, 3)];
        if (!mes) return null;
        r = [nome[0], nome[1], String(mes), nome[3], nome[4], nome[5]] as unknown as RegExpMatchArray;
      }
      if (!r) return null;
      [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
      if (y < 100) y += 2000;
      if (r[4]) [H, M] = [Number(r[4]), Number(r[5])];
    }
  } else return null;
  if (y! < 1950 || y! > 2100 || m! < 1 || m! > 12 || d! < 1) return null;
  // Dia que não existe no mês ("31/02/2024") não pode virar outra data em silêncio (02/03):
  // devolve null, a célula fica como informação extra e o relatório de qualidade aponta a linha.
  if (d! > new Date(Date.UTC(y!, m!, 0)).getUTCDate()) return null;
  // Hora impossível ("25:70") geraria uma data inválida (e um RangeError no toISOString).
  if (H > 23 || M > 59) return null;
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
  aba: AbaLeitura,
  tipo: TipoDados,
  porColuna: Map<string, string>,
): Registro[] {
  const out: Registro[] = [];
  aba.linhas.forEach((linha, i) => {
    const campos: Record<string, unknown> = {};
    const extras: Record<string, unknown> = {};
    let algum = false;
    for (const col of aba.cabecalhos) {
      if (ehAuxiliar(col)) continue;
      const raw = linha[col];
      if (vazio(raw)) continue;
      algum = true;
      const campo = porColuna.get(col);
      const def = campo ? campoDef(tipo, campo) : null;
      if (!def) {
        extras[col] = typeof raw === 'string' ? raw.trim() : raw;
        continue;
      }
      // Placas do conjunto na mesma célula: a primeira é a do campo, as demais completam as carretas.
      if (def.tipo === 'plate' && tipo === 'viagens' && !comoPlaca(raw)) {
        const placas = extrairPlacas(raw);
        if (placas.length > 0) {
          const ordem = ['placa_cavalo', 'placa_carreta', 'placa_carreta_2'];
          const livres = ordem.slice(Math.max(0, ordem.indexOf(campo!)));
          for (const p of placas) {
            const alvo = livres.shift();
            if (!alvo) break;
            if (campos[alvo] === undefined) campos[alvo] = p;
          }
          continue;
        }
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
    if (tipo === 'viagens') for (const p of PARES_DATA_HORA) aplicarHora(campos, extras, p.data, p.hora, p.rotulo);
    const numeroLinha = typeof linha.__linha === 'number' ? (linha.__linha as number) : i + 2;
    delete extras.__linha;
    out.push({ arquivo, aba: aba.nome, linha: numeroLinha, campos, extras });
  });
  corrigirEscalaDePeso(out);
  return out;
}

/**
 * Coluna de peso em kg que mistura "10.781,00" com "9,026" (vírgula usada como milhar) ou
 * toneladas: se a coluna é de milhares de kg, um valor abaixo de 100 está na escala errada.
 */
function corrigirEscalaDePeso(regs: Registro[]) {
  const pesos = regs.map((r) => r.campos.peso_kg).filter((x): x is number => typeof x === 'number' && x > 0);
  if (pesos.length < 5) return;
  const ordenados = [...pesos].sort((a, b) => a - b);
  if (ordenados[Math.floor(ordenados.length / 2)]! < 1000) return;
  for (const r of regs) {
    const p = r.campos.peso_kg;
    if (typeof p === 'number' && p > 0 && p < 100) r.campos.peso_kg = Math.round(p * 1000 * 1000) / 1000;
  }
}

/**
 * Descreve como cada coluna foi entendida. `detalhes` traz a confiança/motivo calculados para as
 * colunas da IA (e as sugestões não aplicadas); as do dicionário recebem a confiança pelo nome.
 */
export function descreverColunas(
  tipo: TipoAbaImportacao,
  cabecalhos: string[],
  porColuna: Map<string, string>,
  daIa: Set<string>,
  detalhes?: ReadonlyMap<string, DetalheColuna>,
): ColunaInterpretadaDetalhada[] {
  return cabecalhos
    .filter((c) => c !== '__linha')
    .map((coluna): ColunaInterpretadaDetalhada => {
      const campo = porColuna.get(coluna) ?? null;
      const def = campo && tipo !== 'ignorada' ? campoDef(tipo, campo) : null;
      const origem: ColunaInterpretada['origem'] =
        tipo === 'ignorada' ? 'ignorada' : campo ? (daIa.has(coluna) ? 'ia' : 'dicionario') : 'extra';
      const d = detalhes?.get(coluna);
      const doDicionario =
        origem === 'dicionario' && campo && tipo !== 'ignorada' ? confiancaDoDicionario(tipo, coluna, campo) : null;
      const confianca = d?.confianca ?? doDicionario?.confianca;
      const motivo = d?.motivo ?? doDicionario?.motivo;
      return {
        coluna,
        campo,
        rotulo: def?.rotulo ?? null,
        origem,
        ...(confianca !== undefined ? { confianca } : {}),
        ...(motivo ? { motivo } : {}),
        ...(d?.sugestao && origem !== 'ignorada' ? { sugestao: d.sugestao } : {}),
      };
    });
}

export function camposLivres(tipo: TipoDados, usados: Set<string>) {
  return CAMPOS_POR_TIPO[tipo].filter((c) => c.multi || !usados.has(c.campo));
}
