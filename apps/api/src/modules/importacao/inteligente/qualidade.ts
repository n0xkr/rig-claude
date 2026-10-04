import { statusViagemDeTexto, TIPO_ABA_IMPORTACAO_LABEL, type StatusViagem, type TipoAbaImportacao } from '@rigabras/shared';
import { mascararPII } from '../../../lib/ai/pii.js';
import { cnhValida, cnpjValido, cpfValido, paisDaPlaca } from '../../../lib/ai/validadores.js';
import { normTexto } from '../../iaSolicitacoes/leitura.js';
import { nomesCompativeis } from './consolidacao.js';
import { campoDef } from './dicionario.js';
import type { AbaLida, Registro, TipoDados } from './interpretacao.js';
import { ehRetratoDiario } from './retratos.js';

/**
 * Relatório de QUALIDADE dos dados da importação (100% determinístico, sem banco e sem IA).
 *
 * Roda sobre os registros já interpretados (etapa 2) e aponta, ANTES de gravar, o que a
 * planilha tem de estranho: linhas duplicadas, chaves de negócio em conflito, placas e
 * documentos inválidos (dígito verificador de CPF/CNPJ/CNH), datas impossíveis ou fora de
 * ordem (coleta depois da entrega...), datas futuras para eventos já realizados, valores
 * negativos ou atípicos (IQR), campos obrigatórios vazios e status que ninguém entendeu.
 *
 * Cada problema traz contagem, até 10 exemplos (linha + valor mascarado), severidade e uma
 * sugestão. A pontuação (0–100) pondera linhas com erro e com alerta. Nada aqui altera os
 * registros: o relatório só informa (a consolidação continua decidindo o que grava).
 */

export type SeveridadeQualidade = 'erro' | 'alerta' | 'info';

export type RegraQualidade =
  | 'linha_duplicada'
  | 'chave_conflitante'
  | 'placa_invalida'
  | 'placa_formato_desconhecido'
  | 'cavalo_igual_carreta'
  | 'cpf_invalido'
  | 'cnpj_invalido'
  | 'cnh_invalida'
  | 'data_invalida'
  | 'datas_fora_de_ordem'
  | 'data_futura'
  | 'data_antiga'
  | 'idade_improvavel'
  | 'ano_fabricacao_invalido'
  | 'valor_negativo'
  | 'valor_atipico'
  | 'valor_fora_da_faixa'
  | 'numero_invalido'
  | 'obrigatorio_vazio'
  | 'coluna_obrigatoria_ausente'
  | 'status_nao_reconhecido';

/** Nome curto de cada regra (texto do sistema — é o que pode ir ao resumo por IA). */
export const TITULO_REGRA: Readonly<Record<RegraQualidade, string>> = {
  linha_duplicada: 'Linha duplicada',
  chave_conflitante: 'Mesmo identificador com dados diferentes',
  placa_invalida: 'Placa inválida',
  placa_formato_desconhecido: 'Placa em formato desconhecido',
  cavalo_igual_carreta: 'Cavalo igual à carreta',
  cpf_invalido: 'CPF inválido',
  cnpj_invalido: 'CNPJ inválido',
  cnh_invalida: 'CNH com dígito verificador inválido',
  data_invalida: 'Data impossível ou não reconhecida',
  datas_fora_de_ordem: 'Datas fora de ordem',
  data_futura: 'Data no futuro para evento já realizado',
  data_antiga: 'Data muito antiga',
  idade_improvavel: 'Idade improvável',
  ano_fabricacao_invalido: 'Ano de fabricação inválido',
  valor_negativo: 'Valor negativo',
  valor_atipico: 'Valor atípico',
  valor_fora_da_faixa: 'Valor fora da faixa possível',
  numero_invalido: 'Número não reconhecido',
  obrigatorio_vazio: 'Campo obrigatório vazio',
  coluna_obrigatoria_ausente: 'Coluna obrigatória ausente',
  status_nao_reconhecido: 'Status não reconhecido',
};

export interface ExemploProblema {
  /** Nº da linha na planilha (null quando o problema é da aba inteira). */
  linha: number | null;
  /** Valor já mascarado/encurtado (documentos mostram só os últimos dígitos). */
  valor?: string;
}

export interface ProblemaQualidade {
  regra: RegraQualidade;
  severidade: SeveridadeQualidade;
  /** Descrição específica ("Coleta depois da chegada no destino"). */
  titulo: string;
  arquivo: string;
  aba: string;
  campo: string | null;
  rotulo_campo: string | null;
  /** Ocorrências (linhas afetadas). */
  total: number;
  exemplos: ExemploProblema[];
  sugestao: string;
}

export interface QualidadeAba {
  arquivo: string;
  aba: string;
  tipo: TipoAbaImportacao;
  linhas: number;
  pontuacao: number;
  linhas_com_erro: number;
  linhas_com_alerta: number;
  erros: number;
  alertas: number;
  infos: number;
}

export type NivelQualidade = 'bom' | 'atencao' | 'critico';

export interface ResumoQualidade {
  texto: string;
  destaques: string[];
  /** 'IA' = narrativa gerada pela IA sobre os números já calculados; 'REGRAS' = modelo de frase. */
  origem: 'IA' | 'REGRAS';
}

export interface RelatorioQualidade {
  pontuacao: number;
  nivel: NivelQualidade;
  linhas_analisadas: number;
  linhas_com_erro: number;
  linhas_com_alerta: number;
  /** Ocorrências por severidade (soma de `total`). */
  totais: { erros: number; alertas: number; infos: number };
  por_aba: QualidadeAba[];
  /** Ordenados por severidade e ocorrências (no máximo `LIMITE_PROBLEMAS`). */
  problemas: ProblemaQualidade[];
  /** Total real de problemas distintos (quando `problemas` foi encurtada). */
  problemas_total: number;
  resumo: ResumoQualidade;
  gerado_em: string;
}

export interface EntradaQualidade {
  abas: readonly AbaLida[];
  /** Texto exato de status → etapa decidida pela IA (o que a consolidação vai usar). */
  statusIa?: ReadonlyMap<string, StatusViagem>;
  /** Referência para "data no futuro" e idade (padrão: agora). */
  hoje?: Date;
}

export const LIMITE_PROBLEMAS = 300;
const LIMITE_EXEMPLOS = 10;
const DIA_MS = 86_400_000;
/** Peso de uma linha com alerta na pontuação (uma linha com erro pesa 1). */
const PESO_ALERTA = 0.35;
/** Multiplicador do IQR para valor atípico (3 = "extremo" de Tukey; evita ruído). */
const K_IQR = 3;
/** PBT máximo de um rodotrem/bitrem no Brasil (~74 t): peso de carga acima disso é erro de escala. */
const PESO_MAXIMO_KG = 75_000;

// ---------------------------------------------------------------------------
// Coletor
// ---------------------------------------------------------------------------

interface Acumulado {
  regra: RegraQualidade;
  severidade: SeveridadeQualidade;
  titulo: string;
  arquivo: string;
  aba: string;
  campo: string | null;
  rotuloCampo: string | null;
  sugestao: string;
  linhas: Set<number>;
  /** O problema atinge a aba inteira (ex.: coluna obrigatória ausente). */
  todas: boolean;
  ocorrencias: number;
  exemplos: ExemploProblema[];
}

interface NovoProblema {
  regra: RegraQualidade;
  severidade: SeveridadeQualidade;
  titulo?: string;
  campo?: string | null;
  sugestao: string;
}

class Coletor {
  readonly itens = new Map<string, Acumulado>();

  constructor(
    private readonly arquivo: string,
    private readonly aba: string,
    private readonly tipo: TipoDados,
  ) {}

  private obter(p: NovoProblema): Acumulado {
    const titulo = p.titulo ?? TITULO_REGRA[p.regra];
    const campo = p.campo ?? null;
    const chave = `${p.regra}|${campo ?? ''}|${titulo}|${p.severidade}`;
    let a = this.itens.get(chave);
    if (!a) {
      a = {
        regra: p.regra,
        severidade: p.severidade,
        titulo,
        arquivo: this.arquivo,
        aba: this.aba,
        campo,
        rotuloCampo: campo ? (campoDef(this.tipo, campo)?.rotulo ?? null) : null,
        sugestao: p.sugestao,
        linhas: new Set(),
        todas: false,
        ocorrencias: 0,
        exemplos: [],
      };
      this.itens.set(chave, a);
    }
    return a;
  }

  /** Um problema numa linha (a mesma linha não conta duas vezes no mesmo problema). */
  linha(p: NovoProblema, linha: number, valor?: string): void {
    const a = this.obter(p);
    if (a.linhas.has(linha)) return;
    a.linhas.add(linha);
    a.ocorrencias++;
    if (a.exemplos.length < LIMITE_EXEMPLOS) a.exemplos.push(valor === undefined ? { linha } : { linha, valor });
  }

  /** Problema da aba inteira (afeta todas as linhas na pontuação). */
  abaInteira(p: NovoProblema, linhas: number, afetaPontuacao: boolean): void {
    const a = this.obter(p);
    a.todas = afetaPontuacao;
    a.ocorrencias = Math.max(a.ocorrencias, linhas);
    if (a.exemplos.length === 0) a.exemplos.push({ linha: null });
  }
}

// ---------------------------------------------------------------------------
// Utilitários puros
// ---------------------------------------------------------------------------

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** Mostra só o final de um documento ("•••.•••.••1-23"): o usuário acha a linha sem expor o dado. */
export function ocultarDocumento(v: unknown): string {
  const d = soDigitos(v);
  if (d.length <= 3) return '•'.repeat(d.length);
  return `${'•'.repeat(d.length - 3)}${d.slice(-3)}`;
}

/** Valor de exemplo para a prévia: limpo, curto e com dados pessoais mascarados. */
function exibir(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  const s = mascararPII(String(v)).replace(/\s+/g, ' ').trim();
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

/** Dia local (horário de Brasília) de uma data ISO: "YYYY-MM-DD" fica como está. */
function diaLocal(iso: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t - 3 * 3_600_000).toISOString().slice(0, 10);
}

const ehIsoData = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v));

/** Data para exibir (dd/mm/aaaa [hh:mm] em horário de Brasília). */
function exibirData(iso: string): string {
  const dia = diaLocal(iso) ?? iso.slice(0, 10);
  const base = `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
  if (iso.length <= 10) return base;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return base;
  const local = new Date(t - 3 * 3_600_000).toISOString();
  return `${base} ${local.slice(11, 16)}`;
}

/** Compara duas datas ISO: dia a dia quando uma delas não tem hora; senão, pelo instante. */
function depoisDe(a: string, b: string): boolean {
  if (a.length <= 10 || b.length <= 10) {
    const da = diaLocal(a);
    const db = diaLocal(b);
    return !!da && !!db && da > db;
  }
  return Date.parse(a) > Date.parse(b);
}

/** Quartil por interpolação linear (lista já ordenada). */
export function quartil(ordenados: readonly number[], p: number): number {
  if (ordenados.length === 0) return Number.NaN;
  const pos = (ordenados.length - 1) * p;
  const base = Math.floor(pos);
  const resto = pos - base;
  const prox = ordenados[base + 1];
  return prox === undefined ? ordenados[base]! : ordenados[base]! + resto * (prox - ordenados[base]!);
}

/** Cercas de Tukey (Q1 − k·IQR, Q3 + k·IQR); null quando não há dados ou variação suficientes. */
export function cercasIqr(valores: readonly number[], k = K_IQR): { min: number; max: number } | null {
  if (valores.length < 8) return null;
  const s = [...valores].sort((a, b) => a - b);
  const q1 = quartil(s, 0.25);
  const q3 = quartil(s, 0.75);
  const iqr = q3 - q1;
  if (!(iqr > 0)) return null;
  return { min: q1 - k * iqr, max: q3 + k * iqr };
}

const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// Regras por tipo de aba
// ---------------------------------------------------------------------------

/** Pares (antes, depois) que precisam estar em ordem cronológica. */
const ORDEM_DATAS: Partial<Record<TipoDados, Array<{ antes: string; depois: string; titulo: string }>>> = {
  viagens: [
    { antes: 'data_ordem_coleta', depois: 'data_coleta', titulo: 'Ordem de coleta depois da coleta' },
    { antes: 'data_coleta', depois: 'data_chegada_fronteira', titulo: 'Coleta depois da chegada na fronteira' },
    { antes: 'data_coleta', depois: 'data_entrega', titulo: 'Coleta depois da chegada no destino' },
    { antes: 'data_inicio_viagem', depois: 'data_entrega', titulo: 'Início da viagem depois da chegada no destino' },
    { antes: 'data_chegada_fronteira', depois: 'data_liberacao_fronteira', titulo: 'Liberação na fronteira antes da chegada na fronteira' },
    { antes: 'data_liberacao_fronteira', depois: 'data_entrega', titulo: 'Liberação na fronteira depois da chegada no destino' },
    { antes: 'data_entrega', depois: 'data_encerramento', titulo: 'Encerramento antes da chegada no destino' },
    { antes: 'data_programacao', depois: 'data_encerramento', titulo: 'Encerramento antes da programação' },
  ],
  motoristas: [
    { antes: 'cnh_primeira_habilitacao', depois: 'cnh_validade', titulo: 'Validade da CNH antes da 1ª habilitação' },
    { antes: 'data_nascimento', depois: 'cnh_primeira_habilitacao', titulo: '1ª habilitação antes do nascimento' },
    { antes: 'data_nascimento', depois: 'data_admissao', titulo: 'Admissão antes do nascimento' },
  ],
  veiculos: [
    { antes: 'ultima_manutencao_data', depois: 'proxima_manutencao_data', titulo: 'Próxima manutenção antes da última' },
  ],
};

/** Datas de eventos JÁ realizados: no futuro (além de 2 dias de folga) são suspeitas. */
const DATAS_REALIZADAS: Partial<Record<TipoDados, string[]>> = {
  viagens: ['data_coleta', 'data_inicio_viagem', 'data_chegada_fronteira', 'data_liberacao_fronteira', 'data_entrega', 'data_encerramento'],
  motoristas: ['data_nascimento', 'data_admissao', 'cnh_primeira_habilitacao', 'toxicologico_data', 'treinamento_pgr_data'],
  veiculos: ['ultima_manutencao_data'],
};

/** Datas operacionais: antes de 2000 quase sempre é digitação errada. */
const DATAS_OPERACIONAIS: Partial<Record<TipoDados, string[]>> = {
  viagens: [
    'data_programacao', 'data_ordem_coleta', 'data_coleta', 'data_inicio_viagem', 'data_chegada_fronteira',
    'data_liberacao_fronteira', 'data_entrega', 'data_encerramento',
  ],
};

/** Campos numéricos que não podem ser negativos (e entram na checagem de valor atípico). */
const NUMERICOS: Partial<Record<TipoDados, string[]>> = {
  viagens: ['peso_kg', 'peso_t', 'valor_mercadoria', 'valor_frete', 'km_rodado', 'km_vazio', 'consumo_combustivel_litros'],
  cargas: ['peso_kg', 'valor_mercadoria'],
  veiculos: ['km_atual', 'capacidade_kg', 'capacidade_t', 'capacidade_m3', 'nivel_combustivel'],
};

interface Obrigatorio {
  campo: string;
  severidade: SeveridadeQualidade;
  efeito: string;
  /** Linha que só fala do veículo (sem rota/cliente/ID) não vira viagem: não cobra o campo. */
  soViagemReal?: boolean;
}

const OBRIGATORIOS: Record<TipoDados, Obrigatorio[]> = {
  viagens: [
    { campo: 'placa_cavalo', severidade: 'erro', efeito: 'a linha é ignorada' },
    { campo: 'origem', severidade: 'alerta', efeito: 'viagem nova é gravada com origem "Não informado"', soViagemReal: true },
    { campo: 'destino', severidade: 'alerta', efeito: 'viagem nova é gravada com destino "Não informado"', soViagemReal: true },
  ],
  veiculos: [{ campo: 'placa', severidade: 'erro', efeito: 'a linha é ignorada' }],
  motoristas: [{ campo: 'nome_completo', severidade: 'erro', efeito: 'a linha é ignorada' }],
  clientes: [{ campo: 'nome', severidade: 'erro', efeito: 'a linha é ignorada' }],
  cargas: [{ campo: 'numero_documento', severidade: 'erro', efeito: 'o documento não é cruzado com nenhuma viagem' }],
  checklists: [{ campo: 'resultado', severidade: 'alerta', efeito: 'o checklist não conta como feito' }],
  smp: [{ campo: 'resultado', severidade: 'alerta', efeito: 'a SMP não conta como feita' }],
  consultas: [{ campo: 'resultado', severidade: 'alerta', efeito: 'a consulta não conta como válida' }],
};

/** Placa que identifica o registro (inválida = linha perdida); as demais só completam. */
const PLACA_PRINCIPAL: Partial<Record<TipoDados, string>> = { viagens: 'placa_cavalo', veiculos: 'placa' };

/** Valor guardado como texto numa coluna de data que parece MESMO uma data (dd/mm/aaaa...). */
const PARECE_DATA = /^\s*\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/;

function viagemReal(c: Record<string, unknown>): boolean {
  return Boolean(c.cliente || c.codigo_externo || c.numero_crt || c.numero_danfe || c.origem || c.destino || c.status_texto);
}

function statusReconhecido(c: Record<string, unknown>, statusIa: ReadonlyMap<string, StatusViagem>): boolean {
  const textos = [c.status_texto, c.localizacao, c.observacoes, c.cliente];
  if (textos.some((t) => typeof t === 'string' && statusViagemDeTexto(t))) return true;
  if ([c.status_texto, c.observacoes].some((t) => typeof t === 'string' && statusIa.has(t))) return true;
  return [c.descarregou, c.chegou, c.em_fronteira, c.em_viagem, c.carregou].some((x) => x === true);
}

// ---------------------------------------------------------------------------
// Avaliação
// ---------------------------------------------------------------------------

/** Ocorrência de uma chave de negócio (para conflitos entre linhas e entre abas). */
interface Ocorrencia {
  coletor: Coletor;
  linha: number;
  valor: string;
}

function avaliarAba(aba: AbaLida, hoje: Date, statusIa: ReadonlyMap<string, StatusViagem>, globais: Globais): Coletor {
  const tipo = aba.tipo as TipoDados;
  const col = new Coletor(aba.info.arquivo, aba.info.aba, tipo);
  const regs = aba.registros;
  const agora = hoje.getTime();
  const anoAtual = hoje.getUTCFullYear();

  // Coluna(s) de cada campo (para achar o valor original guardado em extras quando não foi entendido).
  const colunasDoCampo = new Map<string, string[]>();
  for (const c of aba.info.colunas) if (c.campo) colunasDoCampo.set(c.campo, [...(colunasDoCampo.get(c.campo) ?? []), c.coluna]);
  const temColunas = aba.info.colunas.length > 0;
  const retrato = tipo === 'viagens' && ehRetratoDiario(regs);

  // Coluna obrigatória que nem existe na aba.
  if (temColunas)
    for (const o of OBRIGATORIOS[tipo]) {
      if (colunasDoCampo.has(o.campo)) continue;
      if (o.soViagemReal && retrato) continue;
      const rotulo = campoDef(tipo, o.campo)?.rotulo ?? o.campo;
      col.abaInteira(
        {
          regra: 'coluna_obrigatoria_ausente',
          severidade: o.severidade === 'erro' ? 'erro' : 'info',
          campo: o.campo,
          titulo: `Coluna de ${rotulo.toLowerCase()} ausente`,
          sugestao: `Sem essa coluna, ${o.efeito}. Inclua a coluna na planilha (veja a planilha padrão).`,
        },
        regs.length,
        o.severidade === 'erro',
      );
    }

  const assinaturas = new Map<string, number>();
  const numericos = new Map<string, Array<{ v: number; linha: number }>>();

  for (const r of regs) {
    const c = r.campos;
    const linha = r.linha;

    // 1. Linha idêntica a outra da mesma aba.
    const assinatura = JSON.stringify([c, r.extras]);
    const primeira = assinaturas.get(assinatura);
    if (primeira !== undefined)
      col.linha(
        {
          regra: 'linha_duplicada',
          severidade: 'alerta',
          sugestao: 'Linhas idênticas são lidas uma vez só; apague a cópia se ela não for um registro de verdade.',
        },
        linha,
        `igual à linha ${primeira}`,
      );
    else assinaturas.set(assinatura, linha);

    // 2. Valores que não puderam ser lidos no tipo do campo (ficaram como informação extra).
    for (const [campo, colunas] of colunasDoCampo) {
      const def = campoDef(tipo, campo);
      if (!def) continue;
      for (const coluna of colunas) {
        const bruto = r.extras[coluna];
        if (bruto === undefined) continue;
        if (def.tipo === 'plate') {
          const principal = PLACA_PRINCIPAL[tipo] === campo;
          col.linha(
            {
              regra: 'placa_invalida',
              severidade: principal ? 'erro' : 'alerta',
              campo,
              sugestao: principal
                ? 'Sem placa válida a linha é ignorada. Corrija a placa (ex.: ABC1D23, AB123CD).'
                : 'A placa não foi entendida e fica só nas informações extras.',
            },
            linha,
            exibir(bruto),
          );
        } else if (def.tipo === 'date' || def.tipo === 'datetime') {
          const pareceData = PARECE_DATA.test(String(bruto));
          col.linha(
            {
              regra: 'data_invalida',
              severidade: pareceData ? 'erro' : 'info',
              campo,
              titulo: pareceData ? 'Data impossível (dia ou mês inexistente)' : 'Texto em coluna de data',
              sugestao: pareceData
                ? 'A data não existe no calendário e não será gravada no campo; corrija na planilha.'
                : 'O texto não é uma data e fica só nas informações extras.',
            },
            linha,
            exibir(bruto),
          );
        } else if (def.tipo === 'number' || def.tipo === 'int') {
          col.linha(
            {
              regra: 'numero_invalido',
              severidade: 'alerta',
              campo,
              sugestao: 'O valor não é um número e fica só nas informações extras.',
            },
            linha,
            exibir(bruto),
          );
        }
      }
    }

    // 3. Placas: formato por país e cavalo = carreta (inclui carretas tiradas da célula do conjunto).
    for (const [campo, v] of Object.entries(c)) {
      if (typeof v !== 'string' || !v || campoDef(tipo, campo)?.tipo !== 'plate') continue;
      if (!paisDaPlaca(v))
        col.linha(
          {
            regra: 'placa_formato_desconhecido',
            severidade: 'alerta',
            campo,
            sugestao: 'Não segue o padrão de placa do Brasil, Argentina, Uruguai, Paraguai, Chile ou Bolívia: pode ser outro código (CRT, NF, OS).',
          },
          linha,
          exibir(v),
        );
    }
    if (tipo === 'viagens') {
      const cavalo = typeof c.placa_cavalo === 'string' ? c.placa_cavalo : null;
      if (cavalo && (c.placa_carreta === cavalo || c.placa_carreta_2 === cavalo))
        col.linha(
          {
            regra: 'cavalo_igual_carreta',
            severidade: 'erro',
            campo: 'placa_carreta',
            sugestao: 'A mesma placa aparece como cavalo e carreta; confira as colunas de placas.',
          },
          linha,
          exibir(cavalo),
        );
    }

    // 4. Documentos (dígito verificador).
    if (tipo === 'motoristas') {
      const cpf = soDigitos(c.cpf);
      if (cpf && !cpfValido(cpf))
        col.linha(
          {
            regra: 'cpf_invalido',
            severidade: 'alerta',
            campo: 'cpf',
            sugestao: 'Confira os dígitos: um CPF errado pode juntar motoristas diferentes num mesmo cadastro.',
          },
          linha,
          ocultarDocumento(cpf),
        );
      else if (cpf) globais.cpf.push({ coletor: col, linha, valor: cpf, nome: String(c.nome_completo ?? '') });
      const cnh = soDigitos(c.cnh);
      if (cnh && (cnh.length !== 11 || !cnhValida(cnh)))
        col.linha(
          {
            regra: 'cnh_invalida',
            severidade: cnh.length !== 11 ? 'alerta' : 'info',
            campo: 'cnh',
            titulo: cnh.length !== 11 ? 'CNH sem 11 dígitos' : TITULO_REGRA.cnh_invalida,
            sugestao: 'Confira o número de registro da CNH (11 dígitos).',
          },
          linha,
          ocultarDocumento(cnh),
        );
    }
    if (tipo === 'clientes' && c.documento !== undefined) {
      const doc = soDigitos(c.documento);
      const brasil = !c.pais || paisBrasil(c.pais);
      if (doc.length === 14 && !cnpjValido(doc))
        col.linha(
          { regra: 'cnpj_invalido', severidade: 'alerta', campo: 'documento', sugestao: 'Confira os dígitos do CNPJ.' },
          linha,
          ocultarDocumento(doc),
        );
      else if (doc.length === 11 && brasil && /^\s*\d{3}\.\d{3}\.\d{3}-\d{2}\s*$/.test(String(c.documento)) && !cpfValido(doc))
        col.linha(
          { regra: 'cpf_invalido', severidade: 'alerta', campo: 'documento', sugestao: 'Confira os dígitos do CPF do cliente.' },
          linha,
          ocultarDocumento(doc),
        );
    }

    // 5. Datas: ordem, futuro, muito antigas, idade.
    for (const par of ORDEM_DATAS[tipo] ?? []) {
      const a = c[par.antes];
      const b = c[par.depois];
      if (ehIsoData(a) && ehIsoData(b) && depoisDe(a, b))
        col.linha(
          {
            regra: 'datas_fora_de_ordem',
            severidade: 'alerta',
            campo: par.depois,
            titulo: par.titulo,
            sugestao: 'Confira as duas datas: uma delas provavelmente foi digitada errada (dia/mês invertidos?).',
          },
          linha,
          `${exibirData(a)} → ${exibirData(b)}`,
        );
    }
    for (const campo of DATAS_REALIZADAS[tipo] ?? []) {
      const v = c[campo];
      if (!ehIsoData(v)) continue;
      const folga = tipo === 'viagens' || campo === 'ultima_manutencao_data' ? 2 * DIA_MS : 0;
      if (Date.parse(v) > agora + folga)
        col.linha(
          {
            regra: 'data_futura',
            severidade: 'alerta',
            campo,
            sugestao: 'Evento já realizado com data no futuro: confira o ano ou se é uma previsão.',
          },
          linha,
          exibirData(v),
        );
    }
    for (const campo of DATAS_OPERACIONAIS[tipo] ?? []) {
      const v = c[campo];
      if (ehIsoData(v) && Number(v.slice(0, 4)) < 2000)
        col.linha(
          { regra: 'data_antiga', severidade: 'alerta', campo, sugestao: 'Ano anterior a 2000 numa viagem: confira o ano digitado.' },
          linha,
          exibirData(v),
        );
    }
    if (tipo === 'motoristas' && ehIsoData(c.data_nascimento)) {
      const idade = (agora - Date.parse(c.data_nascimento)) / (365.25 * DIA_MS);
      if (idade < 18 || idade > 85)
        col.linha(
          {
            regra: 'idade_improvavel',
            severidade: 'alerta',
            campo: 'data_nascimento',
            sugestao: 'Idade fora de 18–85 anos para um motorista: confira a data de nascimento.',
          },
          linha,
          `${exibirData(c.data_nascimento)} (${Math.floor(idade)} anos)`,
        );
    }
    if (tipo === 'veiculos' && typeof c.ano_fabricacao === 'number' && (c.ano_fabricacao < 1980 || c.ano_fabricacao > anoAtual + 1))
      col.linha(
        {
          regra: 'ano_fabricacao_invalido',
          severidade: 'alerta',
          campo: 'ano_fabricacao',
          sugestao: `Ano fora de 1980–${anoAtual + 1}: não será gravado no cadastro do veículo.`,
        },
        linha,
        String(c.ano_fabricacao),
      );

    // 6. Números: negativos e faixas físicas.
    for (const campo of NUMERICOS[tipo] ?? []) {
      const v = c[campo];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      if (v < 0) {
        col.linha(
          { regra: 'valor_negativo', severidade: 'erro', campo, sugestao: 'Valor negativo não faz sentido para este campo; confira o sinal.' },
          linha,
          fmtNum(v),
        );
        continue;
      }
      const lista = numericos.get(campo) ?? [];
      lista.push({ v, linha });
      numericos.set(campo, lista);
      if (campo === 'peso_kg' && v > PESO_MAXIMO_KG)
        col.linha(
          {
            regra: 'valor_fora_da_faixa',
            severidade: 'alerta',
            campo,
            titulo: 'Peso acima do máximo de um conjunto rodoviário',
            sugestao: `Mais de ${fmtNum(PESO_MAXIMO_KG)} kg: provavelmente está em gramas ou com separador de milhar errado.`,
          },
          linha,
          `${fmtNum(v)} kg`,
        );
      if (campo === 'nivel_combustivel' && v > 100)
        col.linha(
          {
            regra: 'valor_fora_da_faixa',
            severidade: 'alerta',
            campo,
            titulo: 'Combustível acima de 100%',
            sugestao: 'O nível de combustível é gravado entre 0 e 100%; o valor será limitado a 100.',
          },
          linha,
          fmtNum(v),
        );
    }

    // 7. Obrigatórios vazios (sem contar placa inválida já apontada acima).
    for (const o of OBRIGATORIOS[tipo]) {
      if (c[o.campo] !== undefined && c[o.campo] !== null && c[o.campo] !== '') continue;
      if (temColunas && !colunasDoCampo.has(o.campo)) continue; // já apontado como coluna ausente
      if (o.soViagemReal && (retrato || !viagemReal(c))) continue;
      if ((colunasDoCampo.get(o.campo) ?? []).some((coluna) => r.extras[coluna] !== undefined)) continue;
      const rotulo = campoDef(tipo, o.campo)?.rotulo ?? o.campo;
      col.linha(
        {
          regra: 'obrigatorio_vazio',
          severidade: o.severidade,
          campo: o.campo,
          titulo: `${rotulo} vazio`,
          sugestao: `Sem ${rotulo.toLowerCase()}, ${o.efeito}.`,
        },
        linha,
      );
    }
    if (tipo === 'cargas' && c.numero_documento && !c.viagem_ref && !c.placa)
      col.linha(
        {
          regra: 'obrigatorio_vazio',
          severidade: 'alerta',
          campo: 'viagem_ref',
          titulo: 'Documento sem viagem nem placa',
          sugestao: 'Sem ID da viagem ou placa o documento não é ligado a nenhuma viagem.',
        },
        linha,
        exibir(c.numero_documento),
      );

    // 8. Status que nem as regras nem a IA entenderam.
    if (tipo === 'viagens' && typeof c.status_texto === 'string' && c.status_texto.trim() && !statusReconhecido(c, statusIa))
      col.linha(
        {
          regra: 'status_nao_reconhecido',
          severidade: 'alerta',
          campo: 'status_texto',
          sugestao: 'A viagem mantém a etapa atual (nova: Programada) e o texto fica nas informações extras.',
        },
        linha,
        exibir(c.status_texto),
      );

    // Chaves de negócio (conflitos são avaliados depois, juntando todas as abas).
    if (tipo === 'viagens' && c.codigo_externo && typeof c.placa_cavalo === 'string')
      globais.viagem.push({ coletor: col, linha, valor: normTexto(c.codigo_externo), placa: c.placa_cavalo });
    if (tipo === 'veiculos' && typeof c.placa === 'string' && typeof c.ano_fabricacao === 'number')
      globais.veiculo.push({ coletor: col, linha, valor: c.placa, ano: c.ano_fabricacao });
  }

  // 9. Valores atípicos (IQR) por campo numérico. O combustível mistura fração (0,8) e % (80) de
  // propósito (a consolidação converte), então só tem a checagem de faixa.
  for (const [campo, lista] of numericos) {
    if (campo === 'nivel_combustivel') continue;
    const cercas = cercasIqr(lista.map((x) => x.v));
    if (!cercas) continue;
    for (const x of lista)
      if (x.v < cercas.min || x.v > cercas.max)
        col.linha(
          {
            regra: 'valor_atipico',
            severidade: 'alerta',
            campo,
            sugestao: `Muito fora do padrão da coluna (faixa típica até ${fmtNum(Math.max(0, cercas.max))}): confira unidade e separadores.`,
          },
          x.linha,
          fmtNum(x.v),
        );
  }
  return col;
}

function paisBrasil(pais: unknown): boolean {
  const n = normTexto(pais);
  return n === 'br' || n === 'brasil' || n === 'brazil';
}

interface Globais {
  cpf: Array<Ocorrencia & { nome: string }>;
  viagem: Array<Ocorrencia & { placa: string }>;
  veiculo: Array<Ocorrencia & { ano: number }>;
}

/** Mesma chave de negócio com dados incompatíveis, dentro da aba ou entre abas. */
function avaliarConflitos(g: Globais): void {
  const agrupar = <T extends Ocorrencia>(lista: T[]) => {
    const m = new Map<string, T[]>();
    for (const o of lista) m.set(o.valor, [...(m.get(o.valor) ?? []), o]);
    return m;
  };
  for (const grupo of agrupar(g.cpf).values()) {
    const nomes = grupo.filter((o) => o.nome.trim());
    const conflita = nomes.some((a) => nomes.some((b) => !nomesCompativeis(a.nome, b.nome)));
    if (!conflita) continue;
    for (const o of nomes)
      o.coletor.linha(
        {
          regra: 'chave_conflitante',
          severidade: 'alerta',
          campo: 'cpf',
          titulo: 'Mesmo CPF com nomes diferentes',
          sugestao: 'Os registros serão juntados num só motorista: confira qual CPF está certo.',
        },
        o.linha,
        ocultarDocumento(o.valor),
      );
  }
  for (const grupo of agrupar(g.viagem).values()) {
    if (new Set(grupo.map((o) => o.placa)).size < 2) continue;
    for (const o of grupo)
      o.coletor.linha(
        {
          regra: 'chave_conflitante',
          severidade: 'alerta',
          campo: 'codigo_externo',
          titulo: 'Mesmo ID de viagem com cavalos diferentes',
          sugestao: 'As linhas serão juntadas numa só viagem: confira o ID ou a placa.',
        },
        o.linha,
        exibir(o.placa),
      );
  }
  for (const grupo of agrupar(g.veiculo).values()) {
    if (new Set(grupo.map((o) => o.ano)).size < 2) continue;
    for (const o of grupo)
      o.coletor.linha(
        {
          regra: 'chave_conflitante',
          severidade: 'alerta',
          campo: 'ano_fabricacao',
          titulo: 'Mesma placa com anos de fabricação diferentes',
          sugestao: 'Vale o último lido: confira qual ano está certo.',
        },
        o.linha,
        `${o.valor} · ${o.ano}`,
      );
  }
}

const ORDEM_SEVERIDADE: Record<SeveridadeQualidade, number> = { erro: 0, alerta: 1, info: 2 };

export function nivelDaPontuacao(p: number): NivelQualidade {
  return p >= 90 ? 'bom' : p >= 70 ? 'atencao' : 'critico';
}

const ROTULO_NIVEL: Record<NivelQualidade, string> = { bom: 'boa', atencao: 'atenção', critico: 'crítica' };

/** Frase-resumo sem IA (sempre disponível) — também é o fallback da narrativa por IA. */
export function resumoDeterministico(r: Omit<RelatorioQualidade, 'resumo'>): ResumoQualidade {
  const n = (x: number) => x.toLocaleString('pt-BR');
  if (r.linhas_analisadas === 0) return { texto: 'Nenhuma linha de dados para avaliar.', destaques: [], origem: 'REGRAS' };
  if (r.problemas_total === 0)
    return {
      texto: `Qualidade dos dados: ${r.pontuacao}/100. Nenhum problema encontrado nas ${n(r.linhas_analisadas)} linha(s) analisada(s).`,
      destaques: [],
      origem: 'REGRAS',
    };
  const partes = [`Qualidade dos dados: ${r.pontuacao}/100 (${ROTULO_NIVEL[r.nivel]}).`];
  partes.push(
    `${n(r.linhas_analisadas)} linha(s) analisada(s): ${n(r.linhas_com_erro)} com erro e ${n(r.linhas_com_alerta)} só com alerta.`,
  );
  const principais = r.problemas.filter((p) => p.severidade !== 'info').slice(0, 3);
  const destaques = principais.map(
    (p) => `${n(p.total)} × ${p.titulo.toLowerCase()} em ${TIPO_ABA_IMPORTACAO_LABEL[tipoDaAba(r, p)]} (${p.aba}) — ${p.sugestao}`,
  );
  if (principais.length > 0)
    partes.push(`Confira primeiro: ${principais.map((p) => `${p.titulo.toLowerCase()} (${n(p.total)})`).join('; ')}.`);
  return { texto: partes.join(' '), destaques, origem: 'REGRAS' };
}

function tipoDaAba(r: Pick<RelatorioQualidade, 'por_aba'>, p: ProblemaQualidade): TipoAbaImportacao {
  return r.por_aba.find((a) => a.arquivo === p.arquivo && a.aba === p.aba)?.tipo ?? 'ignorada';
}

/** Relatório de qualidade de todas as abas de dados (abas ignoradas não entram). */
export function avaliarQualidade(entrada: EntradaQualidade): RelatorioQualidade {
  const hoje = entrada.hoje ?? new Date();
  const statusIa = entrada.statusIa ?? new Map<string, StatusViagem>();
  const globais: Globais = { cpf: [], viagem: [], veiculo: [] };
  const avaliadas: Array<{ aba: AbaLida; coletor: Coletor }> = [];
  for (const aba of entrada.abas) {
    if (aba.tipo === 'ignorada') continue;
    avaliadas.push({ aba, coletor: avaliarAba(aba, hoje, statusIa, globais) });
  }
  avaliarConflitos(globais);

  const problemas: ProblemaQualidade[] = [];
  const porAba: QualidadeAba[] = [];
  let linhasTotal = 0;
  let linhasErro = 0;
  let linhasAlerta = 0;
  const totais = { erros: 0, alertas: 0, infos: 0 };

  for (const { aba, coletor } of avaliadas) {
    const todasLinhas = new Set(aba.registros.map((r: Registro) => r.linha));
    const comErro = new Set<number>();
    const comAlerta = new Set<number>();
    const contagem = { erros: 0, alertas: 0, infos: 0 };
    for (const a of coletor.itens.values()) {
      const alvo = a.severidade === 'erro' ? comErro : a.severidade === 'alerta' ? comAlerta : null;
      if (alvo) for (const l of a.todas ? todasLinhas : a.linhas) alvo.add(l);
      const chave = a.severidade === 'erro' ? 'erros' : a.severidade === 'alerta' ? 'alertas' : 'infos';
      contagem[chave] += a.ocorrencias;
      problemas.push({
        regra: a.regra,
        severidade: a.severidade,
        titulo: a.titulo,
        arquivo: a.arquivo,
        aba: a.aba,
        campo: a.campo,
        rotulo_campo: a.rotuloCampo,
        total: a.ocorrencias,
        exemplos: [...a.exemplos].sort((x, y) => (x.linha ?? 0) - (y.linha ?? 0)),
        sugestao: a.sugestao,
      });
    }
    for (const l of comErro) comAlerta.delete(l);
    const linhas = todasLinhas.size;
    const pontuacao = linhas === 0 ? 100 : Math.round(100 * Math.max(0, 1 - (comErro.size + PESO_ALERTA * comAlerta.size) / linhas));
    porAba.push({
      arquivo: aba.info.arquivo,
      aba: aba.info.aba,
      tipo: aba.tipo,
      linhas,
      pontuacao,
      linhas_com_erro: comErro.size,
      linhas_com_alerta: comAlerta.size,
      ...contagem,
    });
    linhasTotal += linhas;
    linhasErro += comErro.size;
    linhasAlerta += comAlerta.size;
    totais.erros += contagem.erros;
    totais.alertas += contagem.alertas;
    totais.infos += contagem.infos;
  }

  problemas.sort((a, b) => ORDEM_SEVERIDADE[a.severidade] - ORDEM_SEVERIDADE[b.severidade] || b.total - a.total);
  const pontuacao = linhasTotal === 0 ? 100 : Math.round(100 * Math.max(0, 1 - (linhasErro + PESO_ALERTA * linhasAlerta) / linhasTotal));
  const base: Omit<RelatorioQualidade, 'resumo'> = {
    pontuacao,
    nivel: nivelDaPontuacao(pontuacao),
    linhas_analisadas: linhasTotal,
    linhas_com_erro: linhasErro,
    linhas_com_alerta: linhasAlerta,
    totais,
    por_aba: porAba,
    problemas: problemas.slice(0, LIMITE_PROBLEMAS),
    problemas_total: problemas.length,
    gerado_em: hoje.toISOString(),
  };
  return { ...base, resumo: resumoDeterministico(base) };
}

/**
 * Só números e rótulos do sistema, para a narrativa por IA: nenhum texto da planilha (nem nome
 * de aba) sai daqui, então não há dado pessoal nem como injetar instrução pelo relatório.
 */
export function agregadosParaResumo(r: RelatorioQualidade) {
  const porRegra = new Map<RegraQualidade, { severidade: SeveridadeQualidade; ocorrencias: number; abas: Set<string> }>();
  for (const p of r.problemas) {
    const atual = porRegra.get(p.regra) ?? { severidade: p.severidade, ocorrencias: 0, abas: new Set<string>() };
    atual.ocorrencias += p.total;
    atual.abas.add(`${p.arquivo}\u0000${p.aba}`);
    if (ORDEM_SEVERIDADE[p.severidade] < ORDEM_SEVERIDADE[atual.severidade]) atual.severidade = p.severidade;
    porRegra.set(p.regra, atual);
  }
  return {
    pontuacao: r.pontuacao,
    nivel: r.nivel,
    linhas_analisadas: r.linhas_analisadas,
    linhas_com_erro: r.linhas_com_erro,
    linhas_com_alerta: r.linhas_com_alerta,
    ocorrencias: r.totais,
    abas: r.por_aba.slice(0, 40).map((a, i) => ({
      aba: `A${i + 1}`,
      tipo: TIPO_ABA_IMPORTACAO_LABEL[a.tipo],
      linhas: a.linhas,
      pontuacao: a.pontuacao,
      linhas_com_erro: a.linhas_com_erro,
      linhas_com_alerta: a.linhas_com_alerta,
    })),
    regras: [...porRegra.entries()]
      .sort((a, b) => ORDEM_SEVERIDADE[a[1].severidade] - ORDEM_SEVERIDADE[b[1].severidade] || b[1].ocorrencias - a[1].ocorrencias)
      .map(([regra, v]) => ({
        regra: TITULO_REGRA[regra],
        severidade: v.severidade,
        ocorrencias: v.ocorrencias,
        abas_afetadas: v.abas.size,
      })),
  };
}
