import {
  STATUS_VIAGEM_LEGADO_PARA_ATUAL,
  STATUS_VIAGEM_TERMINAIS,
  statusViagemDeTexto,
  type ContagemEntidade,
  type StatusViagem,
  type TipoDocumentoCarga,
  type ViagemCargaInput,
  type ViagemConsolidadaPrevia,
} from '@rigabras/shared';
import { iguais, normTexto } from '../../iaSolicitacoes/leitura.js';
import type { AbaLida, Registro } from './interpretacao.js';
import { comoPlaca, lerBool } from './interpretacao.js';

export type Row = Record<string, unknown>;

/** O que já existe no banco (carregado uma vez por importação). */
export interface BaseExistente {
  veiculos: Row[];
  motoristas: Row[];
  clientes: Row[] | null;
  viagens: Row[];
  /** Cargas já gravadas por viagem (só as das viagens que casarem). */
  cargasPorViagem: Map<string, ViagemCargaInput[]>;
}

export type Acao = 'criar' | 'atualizar' | 'igual';

export interface PlanoRegistro {
  acao: Acao;
  ref: string;
  existente: Row | null;
  /** Linha completa (criação) ou só o que muda (atualização). */
  dados: Row;
}

export interface PlanoViagem extends PlanoRegistro {
  motoristaRef: string | null;
  cargas: ViagemCargaInput[];
  cargasMudaram: boolean;
  statusAnterior: StatusViagem | null;
  motoristaAnteriorId: string | null;
  fontes: string[];
  previa: ViagemConsolidadaPrevia;
}

export interface Plano {
  veiculos: PlanoRegistro[];
  motoristas: PlanoRegistro[];
  clientes: PlanoRegistro[];
  viagens: PlanoViagem[];
  erros: Array<{ arquivo: string; aba: string; linha: number | null; mensagem: string }>;
  avisos: string[];
  cruzamentos: {
    viagens_com_motorista: number;
    viagens_com_carreta: number;
    viagens_com_documentos: number;
    pesquisa_ok: number;
    checklist_ok: number;
    smp_ok: number;
    status_deduzidos: number;
  };
}

const PAISES: Array<[string, string[]]> = [
  ['AR', ['ar', 'arg', 'argentina', 'buenos aires', 'rosario', 'cordoba', 'mendoza', 'santa fe', 'paso de los libres', 'libres', 'zarate', 'campana', 'pilar', 'tucuman', 'neuquen', 'mar del plata', 'bahia blanca']],
  ['CL', ['cl', 'chile', 'santiago', 'valparaiso', 'los andes', 'antofagasta', 'concepcion', 'san antonio']],
  ['PY', ['py', 'paraguai', 'paraguay', 'asuncion', 'assuncao', 'guarambare', 'ciudad del este', 'encarnacion', 'luque', 'villeta']],
  ['UY', ['uy', 'uruguai', 'uruguay', 'montevideo', 'montevideu', 'rivera', 'paysandu', 'salto', 'fray bentos', 'colonia']],
  ['BO', ['bo', 'bolivia', 'santa cruz de la sierra', 'la paz', 'cochabamba']],
  ['PE', ['pe', 'peru', 'lima', 'callao']],
  ['BR', ['br', 'brasil', 'brazil', 'rs', 'sc', 'pr', 'sp', 'rj', 'mg']],
];

/** País a partir de um texto ("AR", "Argentina", "Rosario/Santa Fe - AR", "GUARAMBARÉ PY"). */
export function paisDe(texto: unknown): string | null {
  const n = normTexto(texto);
  if (!n) return null;
  const palavras = n.split(' ');
  const ultima = palavras[palavras.length - 1]!;
  for (const [sigla, nomes] of PAISES) if (nomes.includes(n) || (ultima.length === 2 && nomes[0] === ultima)) return sigla;
  for (const [sigla, nomes] of PAISES)
    if (nomes.some((x) => x.length > 3 && ` ${n} `.includes(` ${x} `))) return sigla;
  return null;
}

function tipoVeiculoDe(...textos: unknown[]): string | null {
  const t = normTexto(textos.filter(Boolean).join(' '));
  if (!t) return null;
  if (/\b(cavalo|trator|truck|toco|caminhao)\b/.test(t) && !/\b(carreta|reboque|semi)\b/.test(t)) return 'CAVALO';
  if (/\b(carreta|reboque|semi|semirreboque|bitrem|rodotrem|sider|bau|graneleir|prancha|tanque)\b/.test(t)) {
    if (t.includes('sider')) return 'CARRETA_SIDER';
    if (/\baberta\b|grade baixa|carga seca/.test(t)) return 'CARRETA_ABERTA';
    return 'CARRETA_OUTRO';
  }
  return null;
}

function situacaoDe(texto: unknown): string | null {
  const t = normTexto(texto);
  if (!t) return null;
  if (/manutenc|oficina|conserto|quebrad/.test(t)) return 'MANUTENCAO';
  if (/garagem|parado|patio|inativ|base/.test(t)) return 'GARAGEM';
  if (/viagem|transito|rodando|em rota|carregad/.test(t)) return 'EM_TRANSITO';
  if (/disponivel|livre|liberad/.test(t)) return 'DISPONIVEL';
  return null;
}

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

function tipoDocumento(texto: unknown, numero: string): TipoDocumentoCarga {
  const t = normTexto(texto);
  if (/crt|conhecimento/.test(t)) return 'CRT';
  if (/danfe|nf|nota/.test(t)) return 'DANFE';
  if (/^\d{44}$/.test(numero.replace(/\s/g, ''))) return 'DANFE';
  return t ? 'OUTRO' : 'CRT';
}

/** Mescla listas de cargas pelo número do documento (a mais nova completa a mais antiga). */
function mesclarCargas(base: ViagemCargaInput[], novas: ViagemCargaInput[]): ViagemCargaInput[] {
  const porNumero = new Map<string, ViagemCargaInput>();
  for (const c of [...base, ...novas]) {
    const k = c.numero_documento.trim().toUpperCase();
    const atual = porNumero.get(k);
    if (!atual) {
      porNumero.set(k, { ...c, numero_documento: k });
      continue;
    }
    const junto: ViagemCargaInput = { ...atual };
    for (const [campo, v] of Object.entries(c)) {
      if (v !== undefined && v !== null && v !== '') (junto as Row)[campo] = v;
    }
    porNumero.set(k, junto);
  }
  return [...porNumero.values()];
}

const cargaIgual = (a: ViagemCargaInput[], b: ViagemCargaInput[]) =>
  a.length === b.length &&
  a.every((x) => {
    const y = b.find((c) => c.numero_documento === x.numero_documento);
    return (
      !!y &&
      (['tipo_documento', 'mercadoria', 'tipo_mercadoria', 'peso_kg', 'valor_mercadoria', 'moeda'] as const).every(
        (k) => iguais(x[k], y[k]),
      )
    );
  });

/** Só as colunas em que o valor novo difere do atual (nunca apaga o que a planilha não trouxe). */
function diferenca(novo: Row, atual: Row): Row {
  const d: Row = {};
  for (const [k, v] of Object.entries(novo)) {
    if (v === undefined || v === null || v === '') continue;
    if (k === 'dados_extras') {
      const antes = (atual.dados_extras ?? {}) as Row;
      const extras = Object.fromEntries(Object.entries(v as Row).filter(([ek, ev]) => !iguais(ev, antes[ek])));
      if (Object.keys(extras).length > 0) d.dados_extras = { ...antes, ...extras };
      continue;
    }
    if (k.startsWith('data_') && typeof v === 'string' && typeof atual[k] === 'string') {
      if (Date.parse(v) === Date.parse(atual[k] as string)) continue;
    }
    if (!iguais(v, atual[k])) d[k] = v;
  }
  return d;
}

const ok = (texto: unknown, positivos: RegExp, negativos: RegExp): boolean | null => {
  const b = typeof texto === 'boolean' ? texto : null;
  if (b !== null) return b;
  const t = normTexto(texto);
  if (!t) return null;
  if (negativos.test(t)) return false;
  if (positivos.test(t)) return true;
  return lerBool(texto);
};

/** Mapa chave -> "algum registro ok?" (um registro reprovado não apaga outro aprovado). */
function indiceOk(regs: Registro[], chave: (r: Registro) => string[], positivo: RegExp, negativo: RegExp) {
  const m = new Map<string, boolean>();
  for (const r of regs) {
    const v = ok(r.campos.resultado, positivo, negativo);
    const valida = r.campos.valida === false ? false : v;
    if (valida === null) continue;
    for (const k of chave(r)) m.set(k, (m.get(k) ?? false) || valida);
  }
  return m;
}

const refViagem = (v: unknown) => (v ? `v:${normTexto(v)}` : null);
const refPlaca = (v: unknown) => {
  const p = comoPlaca(String(v ?? ''));
  return p ? `p:${p}` : null;
};

// ---------------------------------------------------------------------------

export function consolidar(
  abas: AbaLida[],
  base: BaseExistente,
  statusIa: Map<string, StatusViagem>,
): Plano {
  const plano: Plano = {
    veiculos: [],
    motoristas: [],
    clientes: [],
    viagens: [],
    erros: [],
    avisos: [],
    cruzamentos: {
      viagens_com_motorista: 0,
      viagens_com_carreta: 0,
      viagens_com_documentos: 0,
      pesquisa_ok: 0,
      checklist_ok: 0,
      smp_ok: 0,
      status_deduzidos: 0,
    },
  };
  const regs = (tipo: string) => abas.filter((a) => a.tipo === tipo).flatMap((a) => a.registros);

  // ----- índices do que já existe --------------------------------------------------
  const veiculoPorPlaca = new Map(base.veiculos.map((v) => [String(v.placa).toUpperCase(), v]));
  const motoristaPor = new Map<string, Row>();
  for (const m of base.motoristas) {
    if (m.codigo_externo) motoristaPor.set(`c:${normTexto(m.codigo_externo)}`, m);
    if (m.cpf && soDigitos(m.cpf).length === 11) motoristaPor.set(`cpf:${soDigitos(m.cpf)}`, m);
    if (m.nome_completo) motoristaPor.set(`n:${normTexto(m.nome_completo)}`, m);
  }
  const clientePor = new Map<string, Row>();
  for (const c of base.clientes ?? []) {
    if (c.codigo_externo) clientePor.set(`c:${normTexto(c.codigo_externo)}`, c);
    if (c.nome) clientePor.set(`n:${normTexto(c.nome)}`, c);
  }

  // ----- motoristas ----------------------------------------------------------------
  const planoMotorista = new Map<string, PlanoRegistro>();
  const acharMotorista = (codigo: unknown, nome: unknown, cpf?: unknown): PlanoRegistro | null => {
    const chaves = [
      codigo ? `c:${normTexto(codigo)}` : null,
      cpf && soDigitos(cpf).length === 11 ? `cpf:${soDigitos(cpf)}` : null,
      nome ? `n:${normTexto(nome)}` : null,
    ].filter(Boolean) as string[];
    for (const k of chaves) {
      const p = planoMotorista.get(k);
      if (p) return p;
    }
    for (const k of chaves) {
      const ex = motoristaPor.get(k);
      if (!ex) continue;
      // Mesmo nome mas códigos diferentes = pessoas diferentes.
      if (codigo && ex.codigo_externo && normTexto(ex.codigo_externo) !== normTexto(codigo)) continue;
      const p: PlanoRegistro = { acao: 'igual', ref: `id:${String(ex.id)}`, existente: ex, dados: {} };
      for (const kk of chaves) planoMotorista.set(kk, p);
      return p;
    }
    return null;
  };
  const registrarMotorista = (dados: Row): PlanoRegistro | null => {
    const nome = dados.nome_completo as string | undefined;
    if (!nome || nome.length < 3) return null;
    const achado = acharMotorista(dados.codigo_externo, nome, dados.cpf);
    if (achado) {
      const alvo = achado.existente ? { ...achado.existente, ...achado.dados } : achado.dados;
      const dif = diferenca(dados, alvo);
      if (Object.keys(dif).length > 0) {
        achado.dados = { ...achado.dados, ...dif };
        if (achado.acao === 'igual') achado.acao = 'atualizar';
      }
      return achado;
    }
    const p: PlanoRegistro = {
      acao: 'criar',
      ref: `novo:${normTexto(nome)}`,
      existente: null,
      dados: { ativo: true, frota_propria: true, ...dados },
    };
    plano.motoristas.push(p);
    for (const k of [
      dados.codigo_externo ? `c:${normTexto(dados.codigo_externo)}` : null,
      dados.cpf ? `cpf:${soDigitos(dados.cpf)}` : null,
      `n:${normTexto(nome)}`,
    ])
      if (k) planoMotorista.set(k, p);
    return p;
  };

  for (const r of regs('motoristas')) {
    const d: Row = { ...r.campos };
    if (d.cpf) d.cpf = soDigitos(d.cpf).length === 11 ? soDigitos(d.cpf) : undefined;
    if (typeof d.vinculo === 'string') d.frota_propria = normTexto(d.vinculo).startsWith('frota propria');
    if (Object.keys(r.extras).length > 0) d.dados_extras = r.extras;
    const p = registrarMotorista(d);
    if (!p) plano.erros.push({ arquivo: r.arquivo, aba: r.aba, linha: r.linha, mensagem: 'Motorista sem nome — linha ignorada' });
    else if (p.existente && p.acao === 'atualizar' && !plano.motoristas.includes(p)) plano.motoristas.push(p);
  }

  // ----- clientes ------------------------------------------------------------------
  const planoCliente = new Map<string, PlanoRegistro>();
  const registrarCliente = (dados: Row) => {
    if (base.clientes === null) return;
    const nome = dados.nome as string | undefined;
    if (!nome || nome.length < 2) return;
    const k = `n:${normTexto(nome)}`;
    const kc = dados.codigo_externo ? `c:${normTexto(dados.codigo_externo)}` : null;
    const jaPlano = planoCliente.get(k) ?? (kc ? planoCliente.get(kc) : undefined);
    const ex = (kc ? clientePor.get(kc) : undefined) ?? clientePor.get(k);
    if (jaPlano) {
      const dif = diferenca(dados, { ...(jaPlano.existente ?? {}), ...jaPlano.dados });
      if (Object.keys(dif).length > 0) {
        jaPlano.dados = { ...jaPlano.dados, ...dif };
        if (jaPlano.acao === 'igual') {
          jaPlano.acao = 'atualizar';
          plano.clientes.push(jaPlano);
        }
      }
      return;
    }
    let p: PlanoRegistro;
    if (ex) {
      const dif = diferenca(dados, ex);
      p = { acao: Object.keys(dif).length > 0 ? 'atualizar' : 'igual', ref: `id:${String(ex.id)}`, existente: ex, dados: dif };
      if (p.acao === 'atualizar') plano.clientes.push(p);
    } else {
      p = { acao: 'criar', ref: k, existente: null, dados: { ...dados, nome_normalizado: normTexto(nome) } };
      plano.clientes.push(p);
    }
    planoCliente.set(k, p);
    if (kc) planoCliente.set(kc, p);
  };
  for (const r of regs('clientes')) {
    const d: Row = { ...r.campos };
    if (Object.keys(r.extras).length > 0) d.dados_extras = r.extras;
    registrarCliente(d);
  }

  // ----- veículos ------------------------------------------------------------------
  const planoVeiculo = new Map<string, PlanoRegistro>();
  const registrarVeiculo = (placa: string, dados: Row, stub: boolean) => {
    const ex = veiculoPorPlaca.get(placa);
    const ja = planoVeiculo.get(placa);
    if (ja) {
      if (stub) return;
      const dif = diferenca(dados, { ...(ja.existente ?? {}), ...ja.dados });
      if (Object.keys(dif).length === 0) return;
      ja.dados = { ...ja.dados, ...dif };
      if (ja.acao === 'igual') {
        ja.acao = 'atualizar';
        plano.veiculos.push(ja);
      }
      return;
    }
    let p: PlanoRegistro;
    if (ex) {
      const dif = stub ? {} : diferenca(dados, ex);
      p = { acao: Object.keys(dif).length > 0 ? 'atualizar' : 'igual', ref: placa, existente: ex, dados: dif };
      if (p.acao === 'atualizar') plano.veiculos.push(p);
    } else {
      p = {
        acao: 'criar',
        ref: placa,
        existente: null,
        dados: { placa, tipo: 'CAVALO', frota_propria: true, ativo: true, ...dados },
      };
      plano.veiculos.push(p);
    }
    planoVeiculo.set(placa, p);
  };
  for (const r of regs('veiculos')) {
    const c = r.campos;
    const placa = c.placa as string | undefined;
    if (!placa) {
      plano.erros.push({ arquivo: r.arquivo, aba: r.aba, linha: r.linha, mensagem: 'Veículo sem placa válida — linha ignorada' });
      continue;
    }
    const d: Row = {};
    const tipo = tipoVeiculoDe(c.tipo_unidade, c.tipo_desc);
    if (tipo) d.tipo = tipo;
    for (const k of [
      'marca', 'modelo', 'ano_fabricacao', 'capacidade_m3', 'vinculo', 'proprietario', 'motorista_atual',
      'km_atual', 'localizacao_atual', 'ultima_manutencao_data', 'proxima_manutencao_data', 'rntrc_numero',
      'rntrc_validade', 'crlv_validade', 'inspecao_tecnica_validade', 'tacografo_validade', 'observacoes_acompanhamento',
    ])
      if (c[k] !== undefined) d[k] = c[k];
    if (typeof c.capacidade_kg === 'number') d.capacidade_kg = c.capacidade_kg;
    else if (typeof c.capacidade_t === 'number') d.capacidade_kg = Math.round(c.capacidade_t * 1000);
    if (typeof c.nivel_combustivel === 'number') {
      const n = c.nivel_combustivel > 0 && c.nivel_combustivel < 1 ? c.nivel_combustivel * 100 : c.nivel_combustivel;
      d.nivel_combustivel = Math.max(0, Math.min(100, Math.round(n)));
    }
    if (typeof d.ano_fabricacao === 'number' && (d.ano_fabricacao < 1980 || d.ano_fabricacao > 2100)) delete d.ano_fabricacao;
    const sit = situacaoDe(c.situacao);
    if (sit) d.status_operacional = sit;
    if (typeof c.vinculo === 'string') d.frota_propria = normTexto(c.vinculo).startsWith('frota propria');
    const extras = { ...r.extras, ...(c.situacao && !sit ? { Situação: c.situacao } : {}) };
    if (Object.keys(extras).length > 0) d.dados_extras = extras;
    registrarVeiculo(placa, d, false);
  }

  // ----- abas de cruzamento --------------------------------------------------------
  const chavesCruz = (r: Registro) =>
    [refViagem(r.campos.viagem_ref), refPlaca(r.campos.placa)].filter(Boolean) as string[];
  const checklistOk = indiceOk(regs('checklists'), chavesCruz, /aprovad|valid|conforme|\bok\b/, /reprovad|vencid|falha|pendente/);
  const smpOk = indiceOk(regs('smp'), chavesCruz, /liberad|finalizad|andamento|aprovad|encerrad|\bok\b|aberta/, /recusad|cancelad|nao aberta|pendente|elaboracao/);
  const consultaOk = indiceOk(
    regs('consultas'),
    (r) =>
      [
        r.campos.alvo ? `c:${normTexto(r.campos.alvo)}` : null,
        r.campos.alvo_nome ? `n:${normTexto(r.campos.alvo_nome)}` : null,
        refPlaca(r.campos.placa),
        refViagem(r.campos.viagem_ref),
      ].filter(Boolean) as string[],
    /adequad|liberad|aprovad|apto|valid/,
    /inadequad|recusad|reprovad|vencid|inapto|bloquead|nao consultado|analise/,
  );
  const cargasPorRef = new Map<string, ViagemCargaInput[]>();
  for (const r of regs('cargas')) {
    const c = r.campos;
    const numero = String(c.numero_documento ?? '').trim();
    if (!numero) continue;
    const carga: ViagemCargaInput = {
      tipo_documento: tipoDocumento(c.tipo_documento, numero),
      numero_documento: numero.toUpperCase(),
      mercadoria: (c.mercadoria as string) ?? null,
      tipo_mercadoria: (c.tipo_mercadoria as string) ?? null,
      peso_kg: (c.peso_kg as number) ?? null,
      valor_mercadoria: (c.valor_mercadoria as number) ?? null,
      moeda: typeof c.moeda === 'string' ? c.moeda.slice(0, 3).toUpperCase() : null,
    };
    const k = refViagem(c.viagem_ref) ?? refPlaca(c.placa);
    if (!k) continue;
    cargasPorRef.set(k, mesclarCargas(cargasPorRef.get(k) ?? [], [carga]));
  }

  // ----- viagens -------------------------------------------------------------------
  const ativasPorPlaca = new Map<string, Row[]>();
  const porCodigo = new Map<string, Row>();
  const porDocumento = new Map<string, Row>();
  for (const v of base.viagens) {
    if (v.codigo_externo) porCodigo.set(normTexto(v.codigo_externo), v);
    if (v.numero_crt) porDocumento.set(String(v.numero_crt).toUpperCase(), v);
    for (const c of base.cargasPorViagem.get(String(v.id)) ?? []) porDocumento.set(c.numero_documento.toUpperCase(), v);
    if (!STATUS_VIAGEM_TERMINAIS.includes(v.status as StatusViagem)) {
      const p = String(v.placa_cavalo).toUpperCase();
      ativasPorPlaca.set(p, [...(ativasPorPlaca.get(p) ?? []), v]);
    }
  }
  const usadas = new Set<string>();
  const planoPorChave = new Map<string, PlanoViagem>();

  for (const r of regs('viagens')) {
    const c = r.campos;
    const placa = c.placa_cavalo as string | undefined;
    const fonte = `${r.arquivo} › ${r.aba} (linha ${r.linha})`;
    if (!placa) {
      plano.erros.push({ arquivo: r.arquivo, aba: r.aba, linha: r.linha, mensagem: 'Viagem sem placa do cavalo válida — linha ignorada' });
      continue;
    }
    const codigo = c.codigo_externo ? String(c.codigo_externo).trim() : null;

    // Documentos (CRT/DANFE) da própria linha + os de outras abas (averbações, lista de CRT...).
    let cargas: ViagemCargaInput[] = [];
    const numerosCrt = String(c.numero_crt ?? '').split(/[;,/\n]| e /).map((s) => s.trim()).filter((s) => s.length >= 3);
    const numerosNf = String(c.numero_danfe ?? '').split(/[;,/\n]| e /).map((s) => s.trim()).filter((s) => s.length >= 3);
    const unica = numerosCrt.length + numerosNf.length === 1;
    for (const n of numerosCrt)
      cargas.push({
        tipo_documento: 'CRT',
        numero_documento: n.toUpperCase(),
        mercadoria: unica ? ((c.mercadoria as string) ?? null) : null,
        tipo_mercadoria: unica ? ((c.tipo_mercadoria as string) ?? null) : null,
        peso_kg: unica ? ((c.peso_kg as number) ?? (typeof c.peso_t === 'number' ? c.peso_t * 1000 : null)) : null,
        valor_mercadoria: unica ? ((c.valor_mercadoria as number) ?? null) : null,
        moeda: unica && typeof c.moeda === 'string' ? c.moeda.slice(0, 3).toUpperCase() : null,
      });
    for (const n of numerosNf)
      cargas.push({
        tipo_documento: 'DANFE',
        numero_documento: n.toUpperCase(),
        mercadoria: unica ? ((c.mercadoria as string) ?? null) : null,
        tipo_mercadoria: unica ? ((c.tipo_mercadoria as string) ?? null) : null,
        peso_kg: unica ? ((c.peso_kg as number) ?? null) : null,
        valor_mercadoria: unica ? ((c.valor_mercadoria as number) ?? null) : null,
      });
    const refs = [codigo ? refViagem(codigo) : null, refPlaca(placa)].filter(Boolean) as string[];
    const externas = codigo ? cargasPorRef.get(refViagem(codigo)!) : undefined;
    if (externas) cargas = mesclarCargas(cargas, externas);

    // Status: coluna de status -> localização/observação -> marcadores Sim/Não -> IA.
    let status: StatusViagem | null = null;
    const textoStatus = typeof c.status_texto === 'string' ? c.status_texto : null;
    if (textoStatus) status = statusViagemDeTexto(textoStatus) ?? statusIa.get(textoStatus) ?? null;
    if (!status && typeof c.localizacao === 'string') status = statusViagemDeTexto(c.localizacao);
    if (!status && typeof c.observacoes === 'string') status = statusViagemDeTexto(c.observacoes) ?? statusIa.get(c.observacoes) ?? null;
    if (!status) {
      if (c.descarregou === true) status = 'VAZIO_NO_CLIENTE';
      else if (c.chegou === true) status = 'CHEGADA_CLIENTE';
      else if (c.em_fronteira === true) status = 'NA_FRONTEIRA';
      else if (c.em_viagem === true) status = 'EM_TRANSITO_FRONTEIRA';
      else if (c.carregou === true) status = 'CARREGADO_AGUARDANDO_DOCUMENTOS';
    }
    if (status) status = STATUS_VIAGEM_LEGADO_PARA_ATUAL[status] ?? status;
    if (status) plano.cruzamentos.status_deduzidos++;

    // Checagens GR: colunas da própria aba; na falta delas, as abas de checklist/SMP/consultas.
    const grs = [c.pesquisa_gr, c.pesquisa_seguradora].filter((x) => typeof x === 'boolean') as boolean[];
    let pesquisa: boolean | undefined = grs.length > 0 ? grs.every(Boolean) : undefined;
    if (pesquisa === undefined) {
      const ks = [
        c.motorista_codigo ? `c:${normTexto(c.motorista_codigo)}` : null,
        c.motorista_nome ? `n:${normTexto(c.motorista_nome)}` : null,
      ].filter(Boolean) as string[];
      const achados = ks.map((k) => consultaOk.get(k)).filter((x) => x !== undefined) as boolean[];
      if (achados.length > 0) pesquisa = achados.some(Boolean);
    }
    const doIndice = (m: Map<string, boolean>) => {
      for (const k of refs) if (m.has(k)) return m.get(k);
      return undefined;
    };
    const checklist = typeof c.checklist_ok === 'boolean' ? c.checklist_ok : doIndice(checklistOk);
    const smp = typeof c.smp_ok === 'boolean' ? c.smp_ok : doIndice(smpOk);

    // Motorista: código -> nome; se não existir em lugar nenhum, é cadastrado com o nome.
    let motoristaPlano: PlanoRegistro | null = null;
    if (c.motorista_codigo || c.motorista_nome) {
      motoristaPlano =
        acharMotorista(c.motorista_codigo, c.motorista_nome) ??
        (c.motorista_nome
          ? registrarMotorista({
              nome_completo: c.motorista_nome,
              ...(c.motorista_codigo ? { codigo_externo: String(c.motorista_codigo) } : {}),
              ...(placa ? { placa_habitual: placa } : {}),
            })
          : null);
      if (!motoristaPlano && c.motorista_codigo)
        plano.avisos.push(`${fonte}: motorista de código ${String(c.motorista_codigo)} não encontrado e sem nome na planilha.`);
    }

    // Cliente citado na viagem vira cadastro de cliente (se ainda não existir).
    if (typeof c.cliente === 'string') registrarCliente({ nome: c.cliente });

    // Veículos: cavalo e carretas existem? senão são cadastrados (placa + tipo).
    const tipoTexto = r.extras['Tipo de veículo'] ?? r.extras['★Tipo de veículo'] ?? '';
    registrarVeiculo(placa, { tipo: 'CAVALO' }, true);
    for (const pc of [c.placa_carreta, c.placa_carreta_2])
      if (typeof pc === 'string') registrarVeiculo(pc, { tipo: tipoVeiculoDe('carreta', tipoTexto) ?? 'CARRETA_OUTRO' }, true);

    const pais = paisDe(c.pais_destino) ?? paisDe(c.destino);
    const peso =
      typeof c.peso_kg === 'number' ? c.peso_kg : typeof c.peso_t === 'number' ? Math.round(c.peso_t * 1000) : undefined;
    const extras: Row = { ...r.extras };
    if (typeof c.localizacao === 'string') extras['Localização atual'] = c.localizacao;
    if (textoStatus && !statusViagemDeTexto(textoStatus)) extras['Status (texto da planilha)'] = textoStatus;
    const dados: Row = {
      codigo_externo: codigo ?? undefined,
      placa_cavalo: placa,
      placa_carreta: c.placa_carreta,
      placa_carreta_2: c.placa_carreta_2,
      cliente: c.cliente,
      origem: c.origem,
      destino: c.destino,
      pais_destino: pais ?? undefined,
      mercadoria: c.mercadoria,
      tipo_mercadoria: c.tipo_mercadoria,
      valor_mercadoria: c.valor_mercadoria,
      valor_frete: c.valor_frete,
      peso_kg: peso,
      numero_mic_dta: c.numero_mic_dta,
      data_programacao: c.data_programacao,
      data_coleta: c.data_coleta,
      data_inicio_viagem: c.data_inicio_viagem,
      data_entrega: c.data_entrega,
      observacoes: c.observacoes,
      pesquisa_ok: pesquisa,
      checklist_ok: checklist,
      smp_ok: smp,
      status: status ?? undefined,
      dados_extras: Object.keys(extras).length > 0 ? extras : undefined,
    };
    if (cargas.length > 0) {
      const principal = cargas.find((x) => x.tipo_documento === 'CRT') ?? cargas[0]!;
      dados.numero_crt = principal.numero_documento;
      if (dados.peso_kg === undefined) {
        const pesos = cargas.map((x) => x.peso_kg).filter((x): x is number => typeof x === 'number');
        if (pesos.length) dados.peso_kg = pesos.reduce((a, b) => a + b, 0);
      }
      if (dados.valor_mercadoria === undefined) {
        const vs = cargas.map((x) => x.valor_mercadoria).filter((x): x is number => typeof x === 'number');
        if (vs.length) dados.valor_mercadoria = vs.reduce((a, b) => a + b, 0);
      }
    }
    for (const k of Object.keys(dados)) if (dados[k] === undefined || dados[k] === null) delete dados[k];

    // Mesma viagem repetida no próprio arquivo (mesmo ID ou documento): junta as linhas.
    const chaveLocal = codigo ? `v:${normTexto(codigo)}` : dados.numero_crt ? `d:${String(dados.numero_crt)}` : null;
    const repetida = chaveLocal ? planoPorChave.get(chaveLocal) : undefined;
    if (repetida) {
      Object.assign(repetida.dados, Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== undefined)));
      repetida.cargas = mesclarCargas(repetida.cargas, cargas);
      repetida.fontes.push(fonte);
      continue;
    }

    // Casa com uma viagem já cadastrada: ID da planilha -> CRT/DANFE -> viagem ativa do mesmo cavalo.
    let existente: Row | null = null;
    if (codigo) existente = porCodigo.get(normTexto(codigo)) ?? null;
    if (!existente)
      for (const cg of cargas) {
        const e = porDocumento.get(cg.numero_documento);
        if (e) {
          existente = e;
          break;
        }
      }
    if (!existente) {
      const candidatas = (ativasPorPlaca.get(placa) ?? []).filter((v) => {
        if (usadas.has(String(v.id))) return false;
        if (codigo && v.codigo_externo && normTexto(v.codigo_externo) !== normTexto(codigo)) return false;
        if (typeof dados.data_programacao === 'string' && typeof v.data_programacao === 'string' && v.codigo_externo) {
          const dias = Math.abs(Date.parse(dados.data_programacao) - Date.parse(v.data_programacao)) / 86400000;
          if (dias > 25) return false;
        }
        return true;
      });
      existente = candidatas[0] ?? null;
    }
    if (existente && usadas.has(String(existente.id))) existente = null;
    if (existente) usadas.add(String(existente.id));

    const cargasAntes = existente ? (base.cargasPorViagem.get(String(existente.id)) ?? []) : [];
    const cargasFinal = mesclarCargas(cargasAntes, cargas);
    const cargasMudaram = !cargaIgual(cargasFinal, cargasAntes);

    if (motoristaPlano?.existente) dados.motorista_id = motoristaPlano.existente.id;
    let acao: Acao = 'criar';
    let dadosFinais = dados;
    if (existente) {
      dadosFinais = diferenca(dados, existente);
      const motoristaNovo = !!motoristaPlano && !motoristaPlano.existente;
      acao =
        Object.keys(dadosFinais).length > 0 || cargasMudaram || motoristaNovo ? 'atualizar' : 'igual';
    } else {
      if (!dados.origem) {
        dados.origem = 'Não informado';
        plano.avisos.push(`${fonte}: origem não informada — gravada como "Não informado".`);
      }
      if (!dados.destino) {
        dados.destino = 'Não informado';
        plano.avisos.push(`${fonte}: destino não informado — gravado como "Não informado".`);
      }
      dados.status ??= 'PROGRAMADA';
    }

    const pv: PlanoViagem = {
      acao,
      ref: chaveLocal ?? `linha:${r.arquivo}:${r.aba}:${r.linha}`,
      existente,
      dados: dadosFinais,
      motoristaRef: motoristaPlano?.ref ?? null,
      cargas: cargasFinal,
      cargasMudaram,
      statusAnterior: (existente?.status as StatusViagem | undefined) ?? null,
      motoristaAnteriorId: (existente?.motorista_id as string | undefined) ?? null,
      fontes: [fonte],
      previa: {
        acao,
        chave: codigo ?? String(dados.numero_crt ?? placa),
        placa_cavalo: placa,
        placa_carreta: (c.placa_carreta as string) ?? (existente?.placa_carreta as string) ?? null,
        motorista: (motoristaPlano?.existente?.nome_completo as string) ?? (motoristaPlano?.dados.nome_completo as string) ?? null,
        cliente: (c.cliente as string) ?? null,
        origem: String(dados.origem ?? existente?.origem ?? ''),
        destino: String(dados.destino ?? existente?.destino ?? ''),
        status: String(status ?? existente?.status ?? 'PROGRAMADA'),
        data_programacao: (dados.data_programacao as string) ?? null,
        documentos: cargasFinal.map((x) => `${x.tipo_documento} ${x.numero_documento}`),
        pesquisa_ok: pesquisa,
        checklist_ok: checklist,
        smp_ok: smp,
        fontes: [fonte],
      },
    };
    plano.viagens.push(pv);
    if (chaveLocal) planoPorChave.set(chaveLocal, pv);
  }

  // ----- totais de cruzamento + situação dos veículos com viagem em andamento -------
  for (const v of plano.viagens) {
    const p = v.previa;
    if (v.motoristaRef) plano.cruzamentos.viagens_com_motorista++;
    if (p.placa_carreta) plano.cruzamentos.viagens_com_carreta++;
    if (v.cargas.length > 0) plano.cruzamentos.viagens_com_documentos++;
    if (p.pesquisa_ok) plano.cruzamentos.pesquisa_ok++;
    if (p.checklist_ok) plano.cruzamentos.checklist_ok++;
    if (p.smp_ok) plano.cruzamentos.smp_ok++;
    const st = p.status as StatusViagem;
    const andamento = !STATUS_VIAGEM_TERMINAIS.includes(st) && st !== 'PROGRAMADA';
    if (andamento) {
      const loc = (v.dados.dados_extras as Row | undefined)?.['Localização atual'];
      registrarVeiculo(
        p.placa_cavalo,
        {
          status_operacional: 'EM_TRANSITO',
          ...(p.motorista ? { motorista_atual: p.motorista } : {}),
          ...(typeof loc === 'string' ? { localizacao_atual: loc } : {}),
        },
        false,
      );
    }
  }
  // Um cadastro pode receber dados de várias abas (ex.: frota diz "Disponível", mas a viagem
  // cruzada mostra o cavalo em trânsito): compara o resultado FINAL com o banco.
  for (const lista of [plano.veiculos, plano.motoristas, plano.clientes]) {
    for (const p of lista) {
      if (!p.existente) continue;
      p.dados = diferenca(p.dados, p.existente);
      p.acao = Object.keys(p.dados).length > 0 ? 'atualizar' : 'igual';
    }
  }
  plano.veiculos = plano.veiculos.filter((p) => p.acao !== 'igual');
  plano.motoristas = plano.motoristas.filter((p) => p.acao !== 'igual');
  plano.clientes = plano.clientes.filter((p) => p.acao !== 'igual');
  return plano;
}

export function contar(regs: PlanoRegistro[], erros = 0): ContagemEntidade {
  return {
    novos: regs.filter((r) => r.acao === 'criar').length,
    atualizados: regs.filter((r) => r.acao === 'atualizar').length,
    iguais: regs.filter((r) => r.acao === 'igual').length,
    erros,
  };
}
