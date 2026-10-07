import type { AnalisarAbaInput, AnalisarAbaResult, OpcaoPergunta } from '@rigabras/shared';
import { RESPOSTA_EXTRA, RESPOSTA_IGNORAR } from '@rigabras/shared';
import {
  ABAS_INFORMATIVAS,
  ABAS_SEM_CADASTRO,
  ENTIDADES,
  OPCOES_TIPO_VEICULO,
  diferencas,
  entidadePorAba,
  lerRegistro,
  type Destino,
  type EntidadeDef,
  type PerguntaCampo,
} from './entidades.js';
import { celulaVazia, comoPlaca, hashCurto, normTexto, valorBruto } from './leitura.js';
import {
  IaSolicitacoesRepository,
  type NovaSolicitacao,
  type Row,
} from './iaSolicitacoes.repository.js';
import { sugerirDestinosDeColunas, sugerirEntidadeDeAba } from './sugestaoIa.js';

const MAX_AVISOS = 25;
const FREQUENCIA_MINIMA = 2;
const EXEMPLO_LIMITE = 5;

type Linha = Record<string, unknown>;

/** Índice `chave -> registro` de uma tabela de cadastro (carregada uma vez por análise). */
export class IndiceCadastro {
  private readonly mapa = new Map<string, Row>();
  constructor(
    private readonly def: EntidadeDef,
    rows: Row[],
  ) {
    for (const r of rows) this.adicionar(r);
  }
  adicionar(row: Row): void {
    for (const k of this.def.chavesDoExistente(row)) if (!this.mapa.has(k)) this.mapa.set(k, row);
  }
  /**
   * Acha o registro que corresponde a `dados`. Se o casamento for só por nome e os
   * dois lados têm códigos DIFERENTES, são pessoas/coisas diferentes: nunca supõe que sejam a mesma.
   */
  achar(dados: Row): Row | null {
    for (const k of this.def.chavesDoNovo(dados)) {
      const r = this.mapa.get(k);
      if (!r) continue;
      if (
        dados.codigo_externo &&
        r.codigo_externo &&
        String(dados.codigo_externo) !== String(r.codigo_externo)
      )
        continue;
      return r;
    }
    return null;
  }
  tem(chave: string): boolean {
    return this.mapa.has(chave);
  }
}

export interface Conhecimento {
  colunas: Map<string, string>; // `${aba}|${coluna}` -> destino
  abas: Map<string, string>; // aba -> entidade | __ignorar__
}

/** Um único uso por requisição: carrega cadastros sob demanda (compartilhado entre análise/aprovações em lote). */
export class Contexto {
  private indices = new Map<string, IndiceCadastro>();
  constructor(readonly repo: IaSolicitacoesRepository) {}
  async indice(def: EntidadeDef): Promise<IndiceCadastro> {
    let i = this.indices.get(def.tabela);
    if (!i) {
      i = new IndiceCadastro(def, await this.repo.carregarCadastro(def.tabela));
      this.indices.set(def.tabela, i);
    }
    return i;
  }
}

export async function carregarConhecimento(repo: IaSolicitacoesRepository): Promise<Conhecimento> {
  const k: Conhecimento = { colunas: new Map(), abas: new Map() };
  for (const r of await repo.conhecimento()) {
    if (r.coluna_norm === '') k.abas.set(r.aba_norm, r.destino);
    else k.colunas.set(`${r.aba_norm}|${r.coluna_norm}`, r.destino);
  }
  return k;
}

class Acumulador {
  readonly novas: NovaSolicitacao[] = [];
  readonly avisos: string[] = [];
  private avisosOmitidos = 0;
  cadastros = 0;
  atualizacoes = 0;
  perguntas = 0;
  jaCadastrados = 0;
  aviso(msg: string): void {
    if (this.avisos.length < MAX_AVISOS) this.avisos.push(msg);
    else this.avisosOmitidos++;
  }
  finalizarAvisos(): string[] {
    return this.avisosOmitidos > 0
      ? [...this.avisos, `… e mais ${this.avisosOmitidos} avisos semelhantes.`]
      : this.avisos;
  }
  add(s: NovaSolicitacao): void {
    this.novas.push(s);
    if (s.tipo === 'CADASTRO') this.cadastros++;
    else if (s.tipo === 'ATUALIZACAO') this.atualizacoes++;
    else this.perguntas++;
  }
}

const linhaVazia = (l: Linha): boolean =>
  Object.values(l).every((v) => celulaVazia(v) || valorBruto(v) === null);

function amostrasDistintas(linhas: Linha[], coluna: string): string[] {
  const vistos = new Set<string>();
  for (const l of linhas) {
    const v = valorBruto(l[coluna]);
    if (v !== null) vistos.add(String(v).slice(0, 80));
    if (vistos.size >= EXEMPLO_LIMITE) break;
  }
  return [...vistos];
}

const colunaTemDado = (linhas: Linha[], coluna: string): boolean =>
  linhas.some((l) => valorBruto(l[coluna]) !== null);

// ---------------------------------------------------------------------------
// Ponto de entrada: analisa UMA aba e devolve o resumo; grava só solicitações
// ---------------------------------------------------------------------------
export async function analisarAba(
  repo: IaSolicitacoesRepository,
  datasetId: string,
  input: AnalisarAbaInput,
): Promise<AnalisarAbaResult> {
  const abaNorm = normTexto(input.aba);
  const conhecimento = await carregarConhecimento(repo);
  const acc = new Acumulador();
  const ctx = new Contexto(repo);
  const linhas = input.linhas.filter((l) => !linhaVazia(l));
  const calculadas = new Set(input.colunasCalculadas);

  const base = (
    situacao: AnalisarAbaResult['situacao'],
    entidade: string | null,
  ): AnalisarAbaResult => ({
    aba: input.aba,
    situacao,
    entidade,
    linhasLidas: linhas.length,
    cadastros: acc.cadastros,
    atualizacoes: acc.atualizacoes,
    perguntas: acc.perguntas,
    jaCadastrados: acc.jaCadastrados,
    colunasCalculadas: input.colunasCalculadas,
    avisos: acc.finalizarAvisos(),
  });

  const decisaoAba = conhecimento.abas.get(abaNorm);
  if (ABAS_INFORMATIVAS.has(abaNorm) || decisaoAba === RESPOSTA_IGNORAR) {
    acc.aviso(
      decisaoAba === RESPOSTA_IGNORAR
        ? 'Aba ignorada por decisão anterior do administrador.'
        : 'Aba de documentação/derivada do modelo da planilha: nada a cadastrar.',
    );
    return base('informativa', null);
  }

  let def: EntidadeDef | null = entidadePorAba(abaNorm);
  if (!def && decisaoAba && decisaoAba in ENTIDADES)
    def = ENTIDADES[decisaoAba as keyof typeof ENTIDADES];

  if (!def && !ABAS_SEM_CADASTRO.has(abaNorm)) {
    // Aba desconhecida: pergunta em vez de supor o que ela é.
    const sugestao = await sugerirEntidadeDeAba(input.aba, input.cabecalhos, linhas.slice(0, 3));
    const opcoes: OpcaoPergunta[] = [
      ...Object.values(ENTIDADES).map((e) => ({
        valor: e.entidade,
        rotulo: `É cadastro de: ${e.rotulo}`,
      })),
      { valor: RESPOSTA_IGNORAR, rotulo: 'Ignorar esta aba' },
    ];
    acc.add({
      dataset_id: datasetId,
      tipo: 'PERGUNTA',
      entidade: 'planilha',
      titulo: `O que representa a aba "${input.aba}"?`,
      descricao: `${linhas.length} linhas, ${input.cabecalhos.length} colunas. Cabeçalhos: ${input.cabecalhos.slice(0, 12).join(', ')}${input.cabecalhos.length > 12 ? '…' : ''}`,
      aba: input.aba,
      pergunta: `Não reconheço a aba "${input.aba}". Ela contém qual tipo de cadastro? (A resposta fica salva: valerá a partir da próxima importação desta planilha.)`,
      entrada: 'OPCAO',
      opcoes,
      sugestao_ia: sugestao,
      evidencia: { cabecalhos: input.cabecalhos, amostra: linhas.slice(0, 3) },
      chave_natural: abaNorm,
      chave_dedup: `p:planilha:${abaNorm}`,
    });
    await persistir(repo, acc);
    return base('desconhecida', null);
  }

  if (def)
    await processarEntidade(ctx, def, datasetId, input, linhas, calculadas, conhecimento, acc);
  await descobrirEntidades(ctx, def, datasetId, input, linhas, calculadas, acc);
  const pendentesInseridas = acc.novas.length;
  await persistir(repo, acc);
  if (!def)
    acc.aviso(
      'Cadastro dos registros desta aba ainda não implementado — extraí placas, motoristas, clientes e pontos frequentes.',
    );
  if (def && pendentesInseridas === 0 && acc.jaCadastrados === 0)
    acc.aviso('Nenhuma linha com dados para cadastrar.');
  return base(def ? 'processada' : 'nao_suportada', def?.entidade ?? null);
}

/** Insere as solicitações novas, descartando as que já foram pedidas/decididas antes (mesma `chave_dedup`). */
async function persistir(repo: IaSolicitacoesRepository, acc: Acumulador): Promise<void> {
  if (acc.novas.length === 0) return;
  const porChave = new Map<string, NovaSolicitacao>();
  for (const s of acc.novas) if (!porChave.has(s.chave_dedup)) porChave.set(s.chave_dedup, s);
  const jaExistem = await repo.dedupExistentes([...porChave.keys()]);
  const novas = [...porChave.values()].filter((s) => !jaExistem.has(s.chave_dedup));
  const repetidas = acc.novas.length - novas.length;
  // As já existentes deixam de contar como "geradas nesta análise".
  for (const s of acc.novas) {
    if (porChave.get(s.chave_dedup) !== s || jaExistem.has(s.chave_dedup)) {
      if (s.tipo === 'CADASTRO') acc.cadastros--;
      else if (s.tipo === 'ATUALIZACAO') acc.atualizacoes--;
      else acc.perguntas--;
    }
  }
  acc.jaCadastrados += repetidas;
  if (repetidas > 0)
    acc.aviso(
      `${repetidas} pedido(s) já haviam sido feitos/decididos antes (ou repetem outra linha) — não foram criados de novo.`,
    );
  await repo.inserir(novas);
  acc.novas.length = 0;
}

// ---------------------------------------------------------------------------
// Aba de uma entidade conhecida
// ---------------------------------------------------------------------------
async function processarEntidade(
  ctx: Contexto,
  def: EntidadeDef,
  datasetId: string,
  input: AnalisarAbaInput,
  linhas: Linha[],
  calculadas: Set<string>,
  conhecimento: Conhecimento,
  acc: Acumulador,
): Promise<void> {
  const abaNorm = normTexto(input.aba);
  const destinos = new Map<string, Destino>();
  const camposUsados = new Set<string>();
  const desconhecidas: string[] = [];

  for (const header of input.cabecalhos) {
    const norm = normTexto(header);
    if (norm === '') continue;
    if (calculadas.has(header)) {
      destinos.set(header, { kind: 'ignorar', motivo: 'calculada' });
      continue;
    }
    const doDicionario = def.colunas[norm];
    const aprendido = conhecimento.colunas.get(`${abaNorm}|${norm}`);
    let destino: Destino | null = null;
    if (doDicionario) {
      if ('campo' in doDicionario)
        destino = def.campos[doDicionario.campo]
          ? { kind: 'campo', campo: doDicionario.campo }
          : null;
      else if ('extra' in doDicionario) destino = { kind: 'extra' };
      else destino = { kind: 'ignorar', motivo: 'conhecida' };
    } else if (aprendido) {
      if (aprendido === RESPOSTA_IGNORAR) destino = { kind: 'ignorar', motivo: 'resposta' };
      else if (aprendido === RESPOSTA_EXTRA) destino = { kind: 'extra' };
      else if (def.campos[aprendido]) destino = { kind: 'campo', campo: aprendido };
    }
    if (destino?.kind === 'campo') {
      if (camposUsados.has(destino.campo)) {
        acc.aviso(
          `Coluna "${header}" também aponta para "${def.campos[destino.campo]!.label}": guardada como informação extra.`,
        );
        destino = { kind: 'extra' };
      } else camposUsados.add(destino.campo);
    }
    if (!destino) {
      if (colunaTemDado(linhas, header)) desconhecidas.push(header);
      destinos.set(header, { kind: 'desconhecida' });
    } else destinos.set(header, destino);
  }

  // Colunas que a IA não conhece: pergunta (com sugestão da IA, nunca aplicada sozinha).
  if (desconhecidas.length > 0) {
    const livres = Object.keys(def.campos).filter(
      (k) => !camposUsados.has(k) && !def.campos[k]!.aux,
    );
    const sugestoes = await sugerirDestinosDeColunas(
      input.aba,
      def,
      desconhecidas.map((coluna) => ({ coluna, amostras: amostrasDistintas(linhas, coluna) })),
      livres,
    );
    for (const coluna of desconhecidas) {
      const amostras = amostrasDistintas(linhas, coluna);
      const opcoes: OpcaoPergunta[] = [
        ...livres.map((k) => ({
          valor: k,
          rotulo: `Campo "${def.campos[k]!.label}" do cadastro de ${def.rotulo}`,
        })),
        { valor: RESPOSTA_EXTRA, rotulo: 'Guardar como informação extra (sem campo próprio)' },
        { valor: RESPOSTA_IGNORAR, rotulo: 'Ignorar esta coluna' },
      ];
      acc.add({
        dataset_id: datasetId,
        tipo: 'PERGUNTA',
        entidade: 'coluna',
        titulo: `O que significa a coluna "${coluna}" da aba ${input.aba}?`,
        descricao: `Exemplos de valores: ${amostras.map((a) => `"${a}"`).join(', ')}`,
        aba: input.aba,
        coluna,
        pergunta: `A coluna "${coluna}" (aba "${input.aba}", cadastro de ${def.rotulo}) não consta no dicionário. O que ela representa? (Vale a partir da próxima importação.)`,
        entrada: 'OPCAO',
        opcoes,
        sugestao_ia: sugestoes.get(coluna) ?? null,
        evidencia: { entidade_alvo: def.entidade, amostras },
        chave_natural: `${abaNorm}|${normTexto(coluna)}`,
        chave_dedup: `p:coluna:${abaNorm}:${normTexto(coluna)}`,
      });
    }
  }

  const indice = await ctx.indice(def);
  const chavesVistas = new Set<string>();

  for (let i = 0; i < linhas.length; i++) {
    const numeroLinha = i + 2; // linha 1 = cabeçalho
    const reg = lerRegistro(def, numeroLinha, linhas[i]!, destinos, input.aba);
    for (const a of reg.avisos) acc.aviso(a);
    if (Object.keys(reg.dados).length === 0 && Object.keys(reg.extras).length === 0) continue; // linha só com fórmulas/vazia

    const faltando = def.obrigatorios.filter((k) => reg.dados[k] === undefined);
    if (faltando.length > 0) {
      acc.aviso(
        `Linha ${numeroLinha}: sem ${faltando.map((k) => def.campos[k]!.label).join(', ')} — não gerou solicitação.`,
      );
      continue;
    }
    const chave = def.chavePrincipal(reg.dados);
    if (!chave) {
      acc.aviso(
        `Linha ${numeroLinha}: não há como identificar o registro (sem código nem nome) — não gerou solicitação.`,
      );
      continue;
    }
    if (chavesVistas.has(chave)) {
      acc.aviso(
        `Linha ${numeroLinha}: repete "${chave}" (já lido em outra linha desta aba) — mantida a primeira.`,
      );
      continue;
    }
    chavesVistas.add(chave);

    const existente = indice.achar(reg.dados);
    const extrasOuNada = Object.keys(reg.extras).length > 0 ? { dados_extras: reg.extras } : {};

    // Perguntas que só existem para criar um registro novo: se ele já existe, o valor atual prevalece.
    let perguntas: PerguntaCampo[] = reg.perguntas;
    if (existente)
      perguntas = perguntas.filter(
        (p) => existente[p.campo] === undefined || existente[p.campo] === null,
      );

    if (perguntas.length > 0) {
      const [primeira, ...restantes] = perguntas;
      acc.add({
        dataset_id: datasetId,
        tipo: 'PERGUNTA',
        entidade: def.entidade,
        titulo: `${def.rotulo}: ${chave} — dúvida sobre "${def.campos[primeira!.campo]?.label ?? primeira!.campo}"`,
        descricao: def.titulo(reg.dados),
        aba: input.aba,
        linha: numeroLinha,
        pergunta: primeira!.pergunta,
        campo_pergunta: primeira!.campo,
        entrada: primeira!.entrada,
        opcoes: primeira!.opcoes,
        dados_propostos: { ...reg.dados, ...extrasOuNada },
        evidencia: { ...reg.evidencia, perguntas_restantes: restantes },
        chave_natural: chave,
        chave_dedup: `p:${def.entidade}:${chave}:${primeira!.campo}`,
      });
      continue;
    }

    if (!existente) {
      const erro = def.validar(reg.dados);
      if (erro) {
        acc.aviso(`Linha ${numeroLinha} (${chave}): ${erro} — não gerou solicitação.`);
        continue;
      }
      acc.add({
        dataset_id: datasetId,
        tipo: 'CADASTRO',
        entidade: def.entidade,
        titulo: def.titulo(reg.dados),
        descricao: `Novo registro lido da aba ${input.aba}, linha ${numeroLinha}.`,
        aba: input.aba,
        linha: numeroLinha,
        dados_propostos: { ...reg.dados, ...extrasOuNada },
        evidencia: reg.evidencia,
        chave_natural: chave,
        chave_dedup: `c:${def.entidade}:${chave}:${hashCurto([reg.dados, reg.extras])}`,
      });
      continue;
    }

    const dif = diferencas(def, reg.dados, reg.extras, existente);
    if (!dif) {
      acc.jaCadastrados++;
      continue;
    }
    const campos = Object.keys(dif.propostos)
      .map((k) => (k === 'dados_extras' ? 'Informações extras' : (def.campos[k]?.label ?? k)))
      .join(', ');
    acc.add({
      dataset_id: datasetId,
      tipo: 'ATUALIZACAO',
      entidade: def.entidade,
      titulo: `Atualizar ${def.titulo({ ...existente, ...reg.dados })}`,
      descricao: `A planilha traz valores diferentes do cadastro atual. Mudam: ${campos}.`,
      aba: input.aba,
      linha: numeroLinha,
      dados_propostos: dif.propostos,
      dados_atuais: dif.atuais,
      evidencia: { ...reg.evidencia, registro_id: existente.id },
      chave_natural: chave,
      chave_dedup: `u:${def.entidade}:${String(existente.id)}:${hashCurto(dif.propostos)}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Descoberta: placas, motoristas, clientes e pontos frequentes citados em qualquer aba
// ---------------------------------------------------------------------------
type ClassePlaca = 'CAVALO' | 'REBOQUE' | 'INDEFINIDO';

function classePorCabecalho(norm: string): ClassePlaca {
  if (norm.includes('carreta') || norm.includes('reboque')) return 'REBOQUE';
  if (norm.includes('cavalo')) return 'CAVALO';
  return 'INDEFINIDO';
}

const cabecalhoDePlaca = (norm: string) =>
  norm === 'placa' || norm.startsWith('placa ') || norm.includes(' placa');

async function descobrirEntidades(
  ctx: Contexto,
  defAba: EntidadeDef | null,
  datasetId: string,
  input: AnalisarAbaInput,
  linhas: Linha[],
  calculadas: Set<string>,
  acc: Acumulador,
): Promise<void> {
  const abaNorm = normTexto(input.aba);
  const cabecalhos = input.cabecalhos.filter((h) => normTexto(h) !== '' && !calculadas.has(h));

  // ---- Placas ---------------------------------------------------------------
  if (defAba?.entidade !== 'veiculos') {
    interface Achado {
      classes: Set<ClassePlaca>;
      colunas: Set<string>;
      ocorrencias: number;
    }
    const achados = new Map<string, Achado>();
    const invalidas = new Map<string, string[]>();
    for (const h of cabecalhos) {
      const norm = normTexto(h);
      if (!cabecalhoDePlaca(norm)) continue;
      const classe = classePorCabecalho(norm);
      const estrita =
        norm === 'placa' ||
        norm === 'placa cavalo' ||
        norm.includes('carreta') ||
        norm.includes('reboque');
      for (const l of linhas) {
        const v = valorBruto(l[h]);
        if (v === null || celulaVazia(v)) continue;
        const p = comoPlaca(v);
        if (!p) {
          if (estrita) {
            const arr = invalidas.get(h) ?? [];
            if (arr.length < 3 && !arr.includes(String(v))) arr.push(String(v));
            invalidas.set(h, arr);
          }
          continue;
        }
        const a = achados.get(p) ?? {
          classes: new Set<ClassePlaca>(),
          colunas: new Set<string>(),
          ocorrencias: 0,
        };
        a.classes.add(classe);
        a.colunas.add(h);
        a.ocorrencias++;
        achados.set(p, a);
      }
    }
    for (const [col, exemplos] of invalidas)
      acc.aviso(
        `Coluna "${col}": valores que não parecem placa (ex.: ${exemplos.join(', ')}) foram ignorados.`,
      );

    if (achados.size > 0) {
      const defV = ENTIDADES.veiculos;
      const indiceV = await ctx.indice(defV);
      const placas = [...achados.keys()];
      const conhecidas = await ctx.repo.chavesNaturaisConhecidas('veiculos', placas);
      for (const placa of placas) {
        if (indiceV.tem(`placa:${placa}`) || conhecidas.has(placa)) continue;
        const a = achados.get(placa)!;
        const colunas = [...a.colunas].map((c) => `"${c}"`).join(', ');
        const origem = `placa encontrada na aba ${input.aba}, coluna ${colunas} (${a.ocorrencias}×)`;
        const unica = a.classes.size === 1 ? [...a.classes][0]! : 'INDEFINIDO';
        if (unica === 'CAVALO') {
          acc.add({
            dataset_id: datasetId,
            tipo: 'CADASTRO',
            entidade: 'veiculos',
            titulo: `Cavalo ${placa}`,
            descricao: `Só a placa é conhecida: ${origem}. O cabeçalho da coluna diz que é cavalo. Vínculo e demais dados não informados.`,
            aba: input.aba,
            dados_propostos: {
              placa,
              tipo: 'CAVALO',
              dados_extras: {
                'Origem do cadastro': origem,
                Vínculo: 'não informado (frota própria é o padrão do sistema)',
              },
            },
            evidencia: { aba: input.aba, colunas: [...a.colunas], ocorrencias: a.ocorrencias },
            chave_natural: placa,
            chave_dedup: `c:veiculos:${placa}:auto`,
          });
          continue;
        }
        const opcoes: OpcaoPergunta[] = [
          ...(unica === 'REBOQUE'
            ? OPCOES_TIPO_VEICULO.filter((o) => o.valor !== 'CAVALO')
            : OPCOES_TIPO_VEICULO),
          { valor: RESPOSTA_IGNORAR, rotulo: 'Não é um veículo / ignorar esta placa' },
        ];
        acc.add({
          dataset_id: datasetId,
          tipo: 'PERGUNTA',
          entidade: 'veiculos',
          titulo: `Placa ${placa}: cavalo ou reboque?`,
          descricao: `Ainda não cadastrada. ${origem}.`,
          aba: input.aba,
          pergunta:
            unica === 'REBOQUE'
              ? `A placa ${placa} (${origem}) parece de reboque/carreta pelo cabeçalho. Que tipo de reboque é?`
              : `A placa ${placa} (${origem}) não está cadastrada e a planilha não diz se é cavalo ou reboque. Qual é o tipo?`,
          campo_pergunta: 'tipo',
          entrada: 'OPCAO',
          opcoes,
          dados_propostos: {
            placa,
            dados_extras: {
              'Origem do cadastro': origem,
              Vínculo: 'não informado (frota própria é o padrão do sistema)',
            },
          },
          evidencia: {
            aba: input.aba,
            colunas: [...a.colunas],
            ocorrencias: a.ocorrencias,
            perguntas_restantes: [],
          },
          chave_natural: placa,
          chave_dedup: `p:veiculos:${placa}:tipo`,
        });
      }
    }
  }

  // ---- Motoristas citados só por código (ID motorista, ID motorista 2...) ----
  if (defAba?.entidade !== 'motoristas') {
    const ids = new Map<string, { ocorrencias: number; colunas: Set<string> }>();
    for (const h of cabecalhos) {
      if (!/^id motorista( \d+)?$/.test(normTexto(h))) continue;
      for (const l of linhas) {
        const v = valorBruto(l[h]);
        if (v === null || celulaVazia(v)) continue;
        const id = String(v).trim();
        const a = ids.get(id) ?? { ocorrencias: 0, colunas: new Set<string>() };
        a.ocorrencias++;
        a.colunas.add(h);
        ids.set(id, a);
      }
    }
    if (ids.size > 0) {
      const defM = ENTIDADES.motoristas;
      const indiceM = await ctx.indice(defM);
      const conhecidos = await ctx.repo.chavesNaturaisConhecidas('motoristas', [...ids.keys()]);
      for (const [id, a] of ids) {
        if (indiceM.tem(`cod:${id}`) || conhecidos.has(id)) continue;
        acc.add({
          dataset_id: datasetId,
          tipo: 'PERGUNTA',
          entidade: 'motoristas',
          titulo: `Motorista ${id}: qual é o nome?`,
          descricao: `Citado na aba ${input.aba}, coluna ${[...a.colunas].map((c) => `"${c}"`).join(', ')} (${a.ocorrencias}×), mas não está cadastrado.`,
          aba: input.aba,
          pergunta: `O código de motorista ${id} aparece na aba "${input.aba}" (${a.ocorrencias}×) mas não consta no cadastro nem na aba MOTORISTAS. Qual é o nome completo dele?`,
          campo_pergunta: 'nome_completo',
          entrada: 'TEXTO',
          dados_propostos: { codigo_externo: id },
          evidencia: {
            aba: input.aba,
            colunas: [...a.colunas],
            ocorrencias: a.ocorrencias,
            perguntas_restantes: [],
          },
          chave_natural: id,
          chave_dedup: `p:motoristas:${id}:nome_completo`,
        });
      }
    }
  }

  // ---- Clientes citados em "Cliente/embarcador" ---------------------------------
  if (defAba?.entidade !== 'clientes') {
    const nomes = new Map<string, { nome: string; ocorrencias: number; coluna: string }>();
    for (const h of cabecalhos) {
      if (!['cliente embarcador', 'cliente', 'embarcador'].includes(normTexto(h))) continue;
      for (const l of linhas) {
        const v = valorBruto(l[h]);
        if (v === null || celulaVazia(v)) continue;
        const nome = String(v).trim();
        const k = normTexto(nome);
        const a = nomes.get(k) ?? { nome, ocorrencias: 0, coluna: h };
        a.ocorrencias++;
        nomes.set(k, a);
      }
    }
    if (nomes.size > 0) {
      const defC = ENTIDADES.clientes;
      const indiceC = await ctx.indice(defC);
      const conhecidos = await ctx.repo.chavesNaturaisConhecidas('clientes', [...nomes.keys()]);
      for (const [k, a] of nomes) {
        if (indiceC.tem(`nome:${k}`) || conhecidos.has(k)) continue;
        const origem = `nome encontrado na aba ${input.aba}, coluna "${a.coluna}" (${a.ocorrencias}×)`;
        acc.add({
          dataset_id: datasetId,
          tipo: 'CADASTRO',
          entidade: 'clientes',
          titulo: `Cliente ${a.nome}`,
          descricao: `Só o nome é conhecido: ${origem}. Documento, país e regras vêm da aba CLIENTES.`,
          aba: input.aba,
          dados_propostos: { nome: a.nome, dados_extras: { 'Origem do cadastro': origem } },
          evidencia: { aba: input.aba, coluna: a.coluna, ocorrencias: a.ocorrencias },
          chave_natural: k,
          chave_dedup: `c:clientes:${k}:auto`,
        });
      }
    }
  }

  // ---- Pontos mais frequentes (origem/destino nas viagens, local nas posições) ---
  if (defAba?.entidade !== 'pontos_apoio' && ABAS_SEM_CADASTRO.has(abaNorm)) {
    const contagem = new Map<
      string,
      { nomes: Map<string, number>; porColuna: Record<string, number> }
    >();
    for (const h of cabecalhos) {
      const norm = normTexto(h);
      if (!['origem', 'destino', 'local'].includes(norm)) continue;
      for (const l of linhas) {
        const v = valorBruto(l[h]);
        if (v === null || celulaVazia(v) || typeof v !== 'string') continue;
        const k = normTexto(v);
        if (k.length < 3) continue;
        const a = contagem.get(k) ?? { nomes: new Map<string, number>(), porColuna: {} };
        a.nomes.set(v.trim(), (a.nomes.get(v.trim()) ?? 0) + 1);
        a.porColuna[h] = (a.porColuna[h] ?? 0) + 1;
        contagem.set(k, a);
      }
    }
    const frequentes = [...contagem.entries()].filter(
      ([, a]) => Object.values(a.porColuna).reduce((x, y) => x + y, 0) >= FREQUENCIA_MINIMA,
    );
    if (frequentes.length > 0) {
      const defP = ENTIDADES.pontos_apoio;
      const indiceP = await ctx.indice(defP);
      const conhecidos = await ctx.repo.chavesNaturaisConhecidas(
        'pontos_apoio',
        frequentes.map(([k]) => k),
      );
      for (const [k, a] of frequentes) {
        if (indiceP.tem(`nome:${k}`) || conhecidos.has(k)) continue;
        const nome = [...a.nomes.entries()].sort((x, y) => y[1] - x[1])[0]![0];
        const total = Object.values(a.porColuna).reduce((x, y) => x + y, 0);
        acc.add({
          dataset_id: datasetId,
          tipo: 'CADASTRO',
          entidade: 'pontos_apoio',
          titulo: defP.titulo({ nome, frequencia: total }),
          descricao: `Ponto frequente detectado na aba ${input.aba}: ${Object.entries(a.porColuna)
            .map(([c, n]) => `${n}× em "${c}"`)
            .join(
              ', ',
            )}. O tipo (base, posto, pátio...) não é informado nessas colunas — fica em branco.`,
          aba: input.aba,
          dados_propostos: {
            nome,
            frequencia: total,
            origem_registro: 'FREQUENTE',
            dados_extras: { 'Contagem por coluna': a.porColuna, Aba: input.aba },
          },
          evidencia: { aba: input.aba, contagem: a.porColuna },
          chave_natural: k,
          chave_dedup: `c:pontos_apoio:${k}:auto`,
        });
      }
    }
  }
}
