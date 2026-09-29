import { IMPORT_TARGET_FIELDS, ImportTargetSchema } from './entities/importacao.js';
import type { ImportTarget } from './entities/importacao.js';

/**
 * Varredura completa de uma planilha (todas as abas, todas as linhas/colunas).
 *
 * Função PURA sobre matrizes (array de linhas) — quem lê o arquivo (SheetJS no
 * navegador, openpyxl no script Python) entrega `unknown[][]` por aba. Assim o
 * mesmo algoritmo roda em qualquer lugar e é testável sem I/O.
 *
 * O que ela descobre por aba (sem presumir "cabeçalho na linha 1"):
 *  - tipo de layout: TABELA | CHAVE_VALOR | TEXTO | VAZIA
 *  - em que linha está o cabeçalho (títulos/linhas em branco acima são ignorados)
 *  - nomes de coluna limpos (sem ★/*, duplicados renomeados, colunas sem título nomeadas)
 *  - linhas realmente preenchidas (descarta "linhas-fantasma" de fórmulas que só devolvem vazio/0)
 *  - perfil por coluna: tipo inferido, % de preenchimento, valores distintos e exemplos
 */

export type TipoAba = 'TABELA' | 'CHAVE_VALOR' | 'TEXTO' | 'VAZIA';
export type TipoColuna = 'texto' | 'numero' | 'data' | 'booleano' | 'misto' | 'vazio';

export interface PerfilColuna {
  nome: string;
  /** Posição (0-based) na matriz original. */
  indice: number;
  tipo: TipoColuna;
  /** 0..1 — fração das linhas de dados com valor. */
  preenchimento: number;
  distintos: number;
  exemplos: string[];
  /** Só para colunas categóricas (poucos valores distintos): útil para normalizar enums. */
  valoresDistintos?: string[];
}

export type LinhaPlanilha = Record<string, unknown>;

export interface AbaEscaneada {
  nome: string;
  oculta: boolean;
  tipo: TipoAba;
  /** Linha (1-based, como no Excel) onde o cabeçalho foi encontrado; null se não for tabela. */
  linhaCabecalho: number | null;
  cabecalhos: string[];
  /** Linhas de dados, chaveadas pelo cabeçalho limpo. Cada linha traz `__linha` (nº real na planilha). */
  linhas: LinhaPlanilha[];
  colunas: PerfilColuna[];
  /** Para CHAVE_VALOR: pares rótulo → valor. Para TEXTO: parágrafos em `texto`. */
  pares?: Array<{ chave: string; valor: unknown }>;
  texto?: string;
  /** Linhas descartadas por estarem vazias ou serem só resíduo de fórmula. */
  linhasDescartadas: number;
  observacoes: string[];
}

export interface PlanilhaEscaneada {
  abas: AbaEscaneada[];
  resumo: {
    totalAbas: number;
    tabelas: number;
    totalLinhas: number;
    totalColunas: number;
  };
}

export interface AbaBruta {
  nome: string;
  oculta?: boolean;
  matriz: unknown[][];
}

/** Limite de linhas de dados por aba aceito pelo endpoint de importação. */
export const LIMITE_LINHAS_IMPORTACAO = 5000;

const MAX_LINHAS_PARA_CABECALHO = 40;
const LIMITE_CATEGORICA = 15;

// ---------------------------------------------------------------------------
// Utilitários de célula
// ---------------------------------------------------------------------------

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Datas viram YYYY-MM-DD (componentes locais) para não "voltar um dia" ao serializar em UTC. */
export function normalizarCelula(v: unknown): unknown {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? null : t;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  return v ?? null;
}

const REGEX_DATA =
  /^(\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?|\d{1,2}\/\d{1,2}\/\d{2,4}([ ]\d{1,2}:\d{2})?)$/;
const REGEX_NUMERO = /^-?\d{1,3}([.,]\d{3})*([.,]\d+)?$|^-?\d+([.,]\d+)?$/;
const BOOLEANOS = new Set(['sim', 'nao', 'não', 'yes', 'no', 'true', 'false', 's', 'n', 'x']);

function tipoDoValor(v: unknown): Exclude<TipoColuna, 'misto' | 'vazio'> {
  if (typeof v === 'number') return 'numero';
  if (typeof v === 'boolean') return 'booleano';
  const s = String(v).trim();
  if (REGEX_DATA.test(s)) return 'data';
  if (REGEX_NUMERO.test(s)) return 'numero';
  if (BOOLEANOS.has(s.toLowerCase())) return 'booleano';
  return 'texto';
}

function vazia(v: unknown): boolean {
  return normalizarCelula(v) === null;
}

/** Remove marcadores de obrigatório (★ * •), quebras de linha e espaços duplicados. */
export function limparCabecalho(bruto: unknown): string {
  return String(bruto ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/^[\s★☆*•·#>\-–—]+/, '')
    .replace(/[\s*]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function letraColuna(indice: number): string {
  let n = indice;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// ---------------------------------------------------------------------------
// Detecção de cabeçalho
// ---------------------------------------------------------------------------

/** Célula "de rótulo": texto curto que não parece número/data — típico de cabeçalho. */
function celulaDeRotulo(v: unknown): boolean {
  const n = normalizarCelula(v);
  if (typeof n !== 'string') return false;
  if (n.length > 80) return false;
  return tipoDoValor(n) === 'texto';
}

interface CandidatoCabecalho {
  indice: number;
  pontos: number;
}

function acharCabecalho(matriz: unknown[][]): CandidatoCabecalho | null {
  let melhor: CandidatoCabecalho | null = null;
  const limite = Math.min(matriz.length, MAX_LINHAS_PARA_CABECALHO);
  for (let r = 0; r < limite; r++) {
    const linha = matriz[r] ?? [];
    const preenchidas = linha.filter((c) => !vazia(c));
    if (preenchidas.length < 2) continue;
    const rotulos = linha.filter(celulaDeRotulo);
    if (rotulos.length / preenchidas.length < 0.8) continue;
    const nomes = rotulos.map((c) => limparCabecalho(c).toLowerCase());
    const unicos = new Set(nomes).size;
    if (unicos / nomes.length < 0.7) continue;

    // Confirma que existem dados logo abaixo (linhas seguintes com preenchimento parecido).
    let abaixo = 0;
    for (let k = r + 1; k < Math.min(matriz.length, r + 6); k++) {
      const proxima = (matriz[k] ?? []).filter((c) => !vazia(c)).length;
      if (proxima >= Math.max(2, Math.floor(preenchidas.length * 0.3))) abaixo++;
    }
    const pontos = rotulos.length * (1 + abaixo / 5);
    if (!melhor || pontos > melhor.pontos * 1.15) melhor = { indice: r, pontos };
  }
  return melhor;
}

// ---------------------------------------------------------------------------
// Perfil de coluna
// ---------------------------------------------------------------------------

function perfilarColuna(
  nome: string,
  indice: number,
  valores: unknown[],
  totalLinhas: number,
): PerfilColuna {
  const preenchidos = valores.filter((v) => v !== null && v !== undefined);
  if (preenchidos.length === 0) {
    return { nome, indice, tipo: 'vazio', preenchimento: 0, distintos: 0, exemplos: [] };
  }
  const tipos = new Set(preenchidos.map(tipoDoValor));
  const tipo: TipoColuna = tipos.size === 1 ? [...tipos][0]! : 'misto';
  const distintosSet = new Set(preenchidos.map((v) => String(v)));
  const exemplos = [...distintosSet]
    .slice(0, 4)
    .map((s) => (s.length > 60 ? `${s.slice(0, 57)}...` : s));
  const perfil: PerfilColuna = {
    nome,
    indice,
    tipo,
    preenchimento: totalLinhas === 0 ? 0 : preenchidos.length / totalLinhas,
    distintos: distintosSet.size,
    exemplos,
  };
  if (
    tipo === 'texto' &&
    distintosSet.size <= LIMITE_CATEGORICA &&
    preenchidos.length >= distintosSet.size * 2
  ) {
    perfil.valoresDistintos = [...distintosSet].sort();
  }
  return perfil;
}

// ---------------------------------------------------------------------------
// Varredura de uma aba
// ---------------------------------------------------------------------------

export function escanearAba(bruta: AbaBruta): AbaEscaneada {
  const { nome, matriz } = bruta;
  const base: AbaEscaneada = {
    nome,
    oculta: !!bruta.oculta,
    tipo: 'VAZIA',
    linhaCabecalho: null,
    cabecalhos: [],
    linhas: [],
    colunas: [],
    linhasDescartadas: 0,
    observacoes: [],
  };
  if (bruta.oculta) base.observacoes.push('Aba oculta no Excel.');

  const preenchidas = matriz.map((l) => (l ?? []).filter((c) => !vazia(c)).length);
  const totalPreenchidas = preenchidas.filter((n) => n > 0).length;
  if (totalPreenchidas === 0) {
    base.observacoes.push('Aba sem nenhum dado.');
    return base;
  }

  const cab = acharCabecalho(matriz);
  if (!cab) {
    return classificarSemCabecalho(base, matriz, preenchidas);
  }

  // Colunas: só as que têm título ou dados; o índice de cada uma vem da linha do cabeçalho.
  const linhaCab = matriz[cab.indice] ?? [];
  const larguraMax = Math.max(
    linhaCab.length,
    ...matriz.slice(cab.indice + 1).map((l) => (l ?? []).length),
  );
  const indices: number[] = [];
  for (let c = 0; c < larguraMax; c++) {
    const temTitulo = !vazia(linhaCab[c]);
    const temDados = matriz.slice(cab.indice + 1).some((l) => !vazia((l ?? [])[c]));
    if (temTitulo || temDados) indices.push(c);
  }

  const usados = new Map<string, number>();
  const cabecalhos = indices.map((c) => {
    let nomeCol = limparCabecalho(linhaCab[c]);
    if (!nomeCol) nomeCol = `Coluna ${letraColuna(c)}`;
    const n = (usados.get(nomeCol.toLowerCase()) ?? 0) + 1;
    usados.set(nomeCol.toLowerCase(), n);
    return n > 1 ? `${nomeCol} (${n})` : nomeCol;
  });

  // Linhas de dados: normaliza células e descarta linhas sem conteúdo real.
  const candidatas: Array<{ linha: number; valores: unknown[] }> = [];
  for (let r = cab.indice + 1; r < matriz.length; r++) {
    const valores = indices.map((c) => normalizarCelula((matriz[r] ?? [])[c]));
    if (valores.every((v) => v === null)) continue;
    candidatas.push({ linha: r + 1, valores });
  }

  // "Linha-fantasma": planilhas-modelo trazem centenas de linhas pré-formatadas cujas colunas de
  // fórmula devolvem 0/"-"/"Sem dados". Uma linha só conta se tiver conteúdo além desses resíduos
  // em pelo menos uma coluna que costuma ser de digitação (preenchida em < 100% das linhas
  // candidatas OU com valores variados).
  const reais = filtrarLinhasFantasma(candidatas, indices.length);
  const descartadas =
    candidatas.length -
    reais.length +
    Math.max(0, matriz.length - cab.indice - 1 - candidatas.length);

  const linhas: LinhaPlanilha[] = reais.map(({ linha, valores }) => {
    const obj: LinhaPlanilha = {};
    cabecalhos.forEach((h, i) => {
      obj[h] = valores[i];
    });
    obj.__linha = linha;
    return obj;
  });

  const colunas = cabecalhos.map((h, i) =>
    perfilarColuna(
      h,
      indices[i]!,
      reais.map((r) => r.valores[i]),
      reais.length,
    ),
  );

  const obs = [...base.observacoes];
  if (cab.indice > 0)
    obs.push(`Cabeçalho encontrado na linha ${cab.indice + 1} (linhas acima foram ignoradas).`);
  if (descartadas > 0)
    obs.push(`${descartadas} linha(s) vazia(s) ou só com resíduo de fórmula foram ignoradas.`);
  if (reais.length > LIMITE_LINHAS_IMPORTACAO) {
    obs.push(
      `A aba tem ${reais.length} linhas; a importação aceita até ${LIMITE_LINHAS_IMPORTACAO} por lote.`,
    );
  }
  const vazias = colunas.filter((c) => c.tipo === 'vazio').length;
  if (vazias > 0) obs.push(`${vazias} coluna(s) sem nenhum valor.`);

  return {
    ...base,
    tipo: reais.length === 0 ? 'VAZIA' : 'TABELA',
    linhaCabecalho: cab.indice + 1,
    cabecalhos,
    linhas,
    colunas,
    linhasDescartadas: descartadas,
    observacoes:
      reais.length === 0 ? [...obs, 'Tabela com cabeçalho, mas sem linhas de dados.'] : obs,
  };
}

/** Valores que planilhas-modelo produzem em colunas de fórmula sem dados de origem. */
const RESIDUOS = new Set([
  '',
  '-',
  '—',
  '0',
  'n/a',
  'false',
  'sem dados',
  'sem viagem',
  '#n/a',
  '#ref!',
  '#value!',
  '#div/0!',
]);

function filtrarLinhasFantasma(
  candidatas: Array<{ linha: number; valores: unknown[] }>,
  numColunas: number,
): Array<{ linha: number; valores: unknown[] }> {
  if (candidatas.length === 0) return candidatas;
  // Célula só de hora (0:00) chega do SheetJS como data-base 1899-12-30/31.
  const ehResiduo = (v: unknown): boolean =>
    v === null || RESIDUOS.has(String(v).trim().toLowerCase()) || String(v).startsWith('1899-12-');

  // Uma coluna é "de fórmula/derivada" quando o valor mais comum ocupa quase todas as linhas
  // candidatas e a coluna aparece preenchida em praticamente todas (ex.: "Desatualizado" = "Sim").
  const colunaConstante: boolean[] = [];
  for (let c = 0; c < numColunas; c++) {
    const contagem = new Map<string, number>();
    let preenchidos = 0;
    for (const { valores } of candidatas) {
      const v = valores[c];
      if (v === null) continue;
      preenchidos++;
      const chave = String(v);
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }
    const topo = Math.max(0, ...contagem.values());
    colunaConstante[c] =
      candidatas.length >= 20 && preenchidos > 0 && topo / candidatas.length >= 0.9;
  }

  return candidatas.filter(({ valores }) =>
    valores.some((v, c) => !ehResiduo(v) && !colunaConstante[c]),
  );
}

function classificarSemCabecalho(
  base: AbaEscaneada,
  matriz: unknown[][],
  preenchidas: number[],
): AbaEscaneada {
  const linhasUteis = matriz
    .map((l, i) => ({ i, celulas: (l ?? []).map(normalizarCelula) }))
    .filter((x) => x.celulas.some((c) => c !== null));
  const larguraMax = Math.max(
    ...linhasUteis.map((x) => x.celulas.filter((c) => c !== null).length),
  );

  // Chave/valor: até 3 colunas, rótulo à esquerda + valor à direita (ex.: PAINEL de indicadores).
  const comPar = linhasUteis.filter((x) => x.celulas.filter((c) => c !== null).length >= 2);
  if (larguraMax <= 3 && comPar.length >= 2) {
    const pares = comPar.map((x) => {
      const [chave, ...resto] = x.celulas.filter((c) => c !== null);
      return { chave: String(chave), valor: resto.length === 1 ? resto[0] : resto };
    });
    return {
      ...base,
      tipo: 'CHAVE_VALOR',
      pares,
      observacoes: [
        ...base.observacoes,
        `${pares.length} pares rótulo → valor (indicadores/parâmetros, não uma tabela de registros).`,
      ],
    };
  }

  const texto = linhasUteis.map((x) => x.celulas.filter((c) => c !== null).join(' | ')).join('\n');
  void preenchidas;
  return {
    ...base,
    tipo: 'TEXTO',
    texto,
    observacoes: [...base.observacoes, 'Aba de texto/instruções — sem estrutura de tabela.'],
  };
}

export function escanearPlanilha(abas: AbaBruta[]): PlanilhaEscaneada {
  const resultado = abas.map(escanearAba);
  return {
    abas: resultado,
    resumo: {
      totalAbas: resultado.length,
      tabelas: resultado.filter((a) => a.tipo === 'TABELA').length,
      totalLinhas: resultado.reduce((s, a) => s + a.linhas.length, 0),
      totalColunas: resultado.reduce((s, a) => s + a.cabecalhos.length, 0),
    },
  };
}

/** Busca um termo (sem acento/caixa) em nomes de aba, cabeçalhos, valores e pares chave/valor. */
export function buscarNaPlanilha(
  planilha: PlanilhaEscaneada,
  termo: string,
  limite = 50,
): Array<{
  aba: string;
  onde: 'aba' | 'coluna' | 'celula' | 'chave';
  linha?: number;
  coluna?: string;
  valor: string;
}> {
  const alvo = semAcento(termo);
  const achados: ReturnType<typeof buscarNaPlanilha> = [];
  if (!alvo) return achados;
  for (const aba of planilha.abas) {
    if (semAcento(aba.nome).includes(alvo))
      achados.push({ aba: aba.nome, onde: 'aba', valor: aba.nome });
    for (const h of aba.cabecalhos) {
      if (semAcento(h).includes(alvo))
        achados.push({ aba: aba.nome, onde: 'coluna', coluna: h, valor: h });
    }
    for (const p of aba.pares ?? []) {
      const texto = `${p.chave} ${String(p.valor)}`;
      if (semAcento(texto).includes(alvo))
        achados.push({ aba: aba.nome, onde: 'chave', coluna: p.chave, valor: String(p.valor) });
    }
    for (const linha of aba.linhas) {
      for (const h of aba.cabecalhos) {
        const v = linha[h];
        if (v !== null && v !== undefined && semAcento(String(v)).includes(alvo)) {
          achados.push({
            aba: aba.nome,
            onde: 'celula',
            linha: linha.__linha as number,
            coluna: h,
            valor: String(v),
          });
        }
      }
      if (achados.length >= limite) return achados.slice(0, limite);
    }
  }
  return achados.slice(0, limite);
}

// ---------------------------------------------------------------------------
// Mapeamento coluna -> campo do sistema (compartilhado UI/API)
// ---------------------------------------------------------------------------

export function semAcento(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Sinônimos comuns em planilhas de frota/viagens, por campo. */
export const SINONIMOS: Record<string, string[]> = {
  placa: ['placa', 'veiculo', 'cavalo', 'plate', 'placa do veiculo', 'placa cavalo'],
  placa_cavalo: ['placa', 'placa cavalo', 'placa do cavalo', 'cavalo', 'veiculo'],
  tipo: ['tipo', 'tipo veiculo', 'tipo de veiculo', 'tipo unidade', 'categoria'],
  marca: ['marca', 'fabricante'],
  modelo: ['modelo'],
  ano_fabricacao: ['ano', 'ano fabricacao', 'ano de fabricacao'],
  capacidade_kg: ['capacidade', 'capacidade kg', 'carga maxima'],
  frota_propria: ['frota propria', 'propria'],
  status_operacional: ['status', 'situacao', 'estado'],
  motorista_atual: ['motorista', 'condutor', 'motorista atual', 'nome do motorista'],
  km_atual: ['km', 'quilometragem', 'odometro', 'km atual', 'mileage'],
  nivel_combustivel: ['combustivel', 'nivel combustivel', 'tanque', 'fuel'],
  localizacao_atual: ['localizacao', 'local', 'posicao', 'localizacao atual'],
  ultima_manutencao_data: ['ultima manutencao', 'manutencao anterior', 'last maintenance'],
  proxima_manutencao_data: ['proxima manutencao', 'next maintenance', 'prox manutencao'],
  observacoes_acompanhamento: ['observacoes', 'obs', 'notas', 'observacao'],
  origem: ['origem', 'saida', 'partida'],
  destino: ['destino', 'chegada', 'entrega'],
  numero_crt: ['crt', 'numero crt', 'n crt', 'crt n', 'crt nº'],
  numero_mic_dta: ['mic', 'dta', 'mic dta', 'numero mic dta', 'mic dta n'],
  pais_destino: ['pais', 'pais destino'],
  peso_kg: ['peso', 'peso kg'],
  valor_frete: ['frete', 'valor frete', 'valor do frete'],
  observacoes: ['observacoes', 'obs', 'notas', 'observacao'],
  data_manutencao: ['data', 'data manutencao', 'data da manutencao'],
  km_veiculo: ['km', 'km veiculo', 'quilometragem'],
  custo: ['custo', 'valor', 'preco'],
  descricao: ['descricao', 'servico', 'detalhe'],
  proxima_manutencao_km: ['proxima manutencao km', 'prox km'],
};

/**
 * Mapeia colunas -> campos do alvo por nome (sem IA). Duas fases: 1) igualdade com
 * chave/rótulo/sinônimo em TODAS as colunas ("fortes"); 2) "contém" só para o que sobrou,
 * preferindo o sinônimo mais longo — evita que "Placa carreta 1" roube o campo `placa` de "Placa".
 */
export function mapearPorNomeDetalhado(
  target: ImportTarget,
  cabecalhos: string[],
): { mapa: Record<string, string | null>; fortes: Set<string> } {
  const campos = IMPORT_TARGET_FIELDS[target];
  const usados = new Set<string>();
  const fortes = new Set<string>();
  const mapa: Record<string, string | null> = Object.fromEntries(cabecalhos.map((c) => [c, null]));

  const nomesDoCampo = (key: string, label: string): string[] => [
    key.replace(/_/g, ' '),
    semAcento(label),
    ...(SINONIMOS[key] ?? []),
  ];

  for (const col of cabecalhos) {
    const c = semAcento(col);
    const campo = campos.find(
      (f) => !usados.has(f.key) && nomesDoCampo(f.key, f.label).includes(c),
    );
    if (campo) {
      usados.add(campo.key);
      fortes.add(campo.key);
      mapa[col] = campo.key;
    }
  }

  for (const col of cabecalhos) {
    if (mapa[col]) continue;
    const c = semAcento(col);
    if (c.length < 3) continue;
    let melhor: { key: string; tam: number } | null = null;
    for (const campo of campos) {
      if (usados.has(campo.key)) continue;
      for (const n of SINONIMOS[campo.key] ?? []) {
        if (
          n.length >= 4 &&
          (c.includes(n) || n.includes(c)) &&
          (!melhor || n.length > melhor.tam)
        ) {
          melhor = { key: campo.key, tam: n.length };
        }
      }
    }
    if (melhor) {
      usados.add(melhor.key);
      mapa[col] = melhor.key;
    }
  }
  return { mapa, fortes };
}

export function mapearPorNome(
  target: ImportTarget,
  cabecalhos: string[],
): Record<string, string | null> {
  return mapearPorNomeDetalhado(target, cabecalhos).mapa;
}

export function pontuarAlvo(
  target: ImportTarget,
  cabecalhos: string[],
): { pontos: number; obrigatoriosOk: boolean } {
  const mapa = mapearPorNome(target, cabecalhos);
  const obrigatorios = IMPORT_TARGET_FIELDS[target].filter((c) => c.required).map((c) => c.key);
  const mapeados = new Set(Object.values(mapa).filter(Boolean) as string[]);
  const ok = obrigatorios.filter((k) => mapeados.has(k)).length;
  return {
    pontos: mapeados.size + ok * 2 - (obrigatorios.length - ok) * 3,
    obrigatoriosOk: ok === obrigatorios.length,
  };
}

/** Palavras no NOME da aba que indicam o destino (ex.: aba "VEICULOS", "FOLLOWUP"). */
const DICA_NOME_ABA: Record<ImportTarget, string[]> = {
  viagens: ['viagem', 'viagens', 'followup', 'follow up'],
  veiculos: ['veiculo', 'veiculos', 'frota'],
  manutencoes_veiculo: ['manutencao', 'manutencoes'],
};

/** Mínimo de campos casados por igualdade de nome para aceitar um destino sem dica no nome da aba. */
const MINIMO_CAMPOS_FORTES = 6;

/**
 * Escolhe o destino mais provável para uma aba. Devolve `null` quando nenhum destino é
 * convincente — a aba é de referência (motoristas, rastreadores, listas, FAQ…) e não deve ser
 * importada por engano só porque tem uma coluna "Placa". Critério: todos os campos obrigatórios
 * casados POR NOME EXATO e (pelo menos 6 campos exatos OU nome da aba indica o destino).
 * O usuário sempre pode escolher o destino manualmente.
 */
export function sugerirAlvo(
  cabecalhos: string[],
  nomeAba = '',
): { target: ImportTarget; pontos: number } | null {
  const alvos = ImportTargetSchema.options as ImportTarget[];
  const nome = semAcento(nomeAba);
  const candidatos = alvos
    .map((t) => {
      const { fortes } = mapearPorNomeDetalhado(t, cabecalhos);
      const obrigatorios = IMPORT_TARGET_FIELDS[t].filter((c) => c.required).map((c) => c.key);
      const obrigOk = obrigatorios.every((k) => fortes.has(k));
      const dica = DICA_NOME_ABA[t].some((d) => nome.includes(d));
      const aceito = obrigOk && (fortes.size >= MINIMO_CAMPOS_FORTES || dica);
      return { t, aceito, pontos: fortes.size + (dica ? 10 : 0) };
    })
    .filter((x) => x.aceito)
    .sort((a, b) => b.pontos - a.pontos);
  const melhor = candidatos[0];
  return melhor ? { target: melhor.t, pontos: melhor.pontos } : null;
}

/**
 * Versão tolerante para arquivos com UMA única tabela (CSV, planilha simples): aqui não há "abas de
 * referência" para confundir, então basta o melhor destino cujos campos obrigatórios estejam
 * cobertos (por nome exato ou parcial) — mesmo com poucas colunas.
 */
export function sugerirAlvoTolerante(
  cabecalhos: string[],
): { target: ImportTarget; pontos: number } | null {
  const alvos = ImportTargetSchema.options as ImportTarget[];
  const melhor = alvos
    .map((t) => ({ t, ...pontuarAlvo(t, cabecalhos) }))
    .filter((x) => x.obrigatoriosOk)
    .sort((a, b) => b.pontos - a.pontos)[0];
  return melhor ? { target: melhor.t, pontos: melhor.pontos } : null;
}
