import {
  FLUXO_STATUS_VIAGEM,
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
import { comoPlaca, lerBool, lerDataHora } from './interpretacao.js';
import { clienteDoTexto, consolidarRetratoDiario } from './retratos.js';

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

/** Status que os códigos curtos das planilhas de frota dão sem detalhe ("INDO CARREGADO", "EM ADUANA"). */
const STATUS_GENERICOS = new Set<StatusViagem>([
  'PROGRAMADA',
  'CARREGADO_AGUARDANDO_DOCUMENTOS',
  'EM_TRANSITO_FRONTEIRA',
  'ENTRADA_ADUANA_MULTILOG',
]);

/**
 * A coluna de status manda; a observação só detalha um status genérico com uma etapa mais
 * adiante na ida ("INDO CARREGADO" + "VEICULO NA COTECAR AGUARDANDO LIBERAÇÃO" = Cotecar). Ela
 * nunca transforma a viagem em retorno/encerrada ("RET.CARREGADO" + "EM TRANSITO RET." segue
 * sendo retorno carregado).
 */
function refinarStatus(principal: StatusViagem | null, detalhe: StatusViagem | null): StatusViagem | null {
  if (!principal) return detalhe;
  if (!detalhe || !STATUS_GENERICOS.has(principal)) return principal;
  if (detalhe === 'RETORNANDO_VAZIO' || detalhe === 'ENCERRADA' || detalhe === 'CANCELADA') return principal;
  return FLUXO_STATUS_VIAGEM.indexOf(detalhe) > FLUXO_STATUS_VIAGEM.indexOf(principal) ? detalhe : principal;
}

/**
 * Mesmo motorista escrito curto numa aba e completo na outra ("CLEBER BALDEZ" x "CLEBER DA
 * SILVA BALDEZ", "EDGAR" x "EDGAR JOSUE DE MOURA"): mesmo primeiro nome e todas as palavras do
 * nome curto aparecem, na ordem, no nome longo.
 */
const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
export function nomesCompativeis(a: string, b: string): boolean {
  const pa = normTexto(a).split(' ').filter((x) => x && !PARTICULAS.has(x));
  const pb = normTexto(b).split(' ').filter((x) => x && !PARTICULAS.has(x));
  if (pa.length === 0 || pb.length === 0 || pa[0] !== pb[0]) return false;
  const [curto, longo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  let i = 0;
  for (const w of longo) if (w === curto[i]) i++;
  return i === curto.length;
}

/** MOPP em texto livre: "Possui - 18/07/2026" | "Não possui" | "Vencido". */
function lerMopp(texto: unknown): { mopp?: boolean; mopp_validade?: string } {
  const t = normTexto(texto);
  if (!t) return {};
  const data = String(texto).match(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}/);
  const validade = data ? (lerDataHora(data[0], true) ?? undefined) : undefined;
  const comValidade = validade ? { mopp_validade: validade } : {};
  if (/^(nao|sem|n)\b/.test(t)) return { mopp: false };
  if (/vencid/.test(t)) return { mopp: false, ...comValidade };
  if (/^(possui|sim|s|tem|ok|valido)\b/.test(t) || validade) return { mopp: true, ...comValidade };
  return {};
}

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
  // Chave sem hífen/espaço: cadastros antigos têm "IIK-3294" e a planilha traz "IIK3294".
  const chavePlaca = (p: unknown) => String(p ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const veiculoPorPlaca = new Map(base.veiculos.map((v) => [chavePlaca(v.placa), v]));
  /** Placa como está no cadastro (viagens.placa_cavalo é FK para veiculos.placa). */
  const placaCadastro = <T,>(p: T): T =>
    typeof p === 'string' ? ((veiculoPorPlaca.get(chavePlaca(p))?.placa as T | undefined) ?? p) : p;
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
    // Nome curto x nome completo: só casa se houver UM candidato compatível (sem CPF/código em conflito).
    if (typeof nome === 'string' && nome.trim()) {
      const cpfNovo = cpf && soDigitos(cpf).length === 11 ? soDigitos(cpf) : null;
      const conflita = (r: Row) =>
        (!!cpfNovo && !!r.cpf && soDigitos(r.cpf) !== cpfNovo) ||
        (!!codigo && !!r.codigo_externo && normTexto(r.codigo_externo) !== normTexto(codigo));
      const doPlano = [...new Set(planoMotorista.values())].filter((p) => {
        const alvo = { ...(p.existente ?? {}), ...p.dados };
        return typeof alvo.nome_completo === 'string' && nomesCompativeis(nome, alvo.nome_completo) && !conflita(alvo);
      });
      const idsPlano = new Set(doPlano.map((p) => p.existente?.id).filter(Boolean));
      const doBanco = base.motoristas.filter(
        (m) =>
          !idsPlano.has(m.id) &&
          typeof m.nome_completo === 'string' &&
          nomesCompativeis(nome, m.nome_completo) &&
          !conflita(m),
      );
      if (doPlano.length + doBanco.length === 1) {
        const p: PlanoRegistro = doPlano[0] ?? {
          acao: 'igual',
          ref: `id:${String(doBanco[0]!.id)}`,
          existente: doBanco[0]!,
          dados: {},
        };
        for (const kk of chaves) planoMotorista.set(kk, p);
        return p;
      }
    }
    return null;
  };
  const registrarMotorista = (entrada: Row): PlanoRegistro | null => {
    let dados = entrada;
    const nome = dados.nome_completo as string | undefined;
    if (!nome || nome.length < 3) return null;
    const achado = acharMotorista(dados.codigo_externo, nome, dados.cpf);
    if (achado) {
      const alvo = achado.existente ? { ...achado.existente, ...achado.dados } : achado.dados;
      // Casou pelo nome curto: fica o nome mais completo; o curto vira apelido.
      const atual = String(alvo.nome_completo ?? '');
      if (atual && normTexto(atual) !== normTexto(nome)) {
        const [curto, longo] = normTexto(nome).length > normTexto(atual).length ? [atual, nome] : [nome, atual];
        dados = { ...dados, nome_completo: longo, ...(alvo.apelido ? {} : { apelido: curto }) };
      }
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

  /** Viagem traz o nome completo de quem já está no plano pelo nome curto: completa o cadastro. */
  const completarNome = (p: PlanoRegistro, nome: string) => {
    const alvo = { ...(p.existente ?? {}), ...p.dados };
    const atual = String(alvo.nome_completo ?? '');
    if (normTexto(nome).length <= normTexto(atual).length || normTexto(nome) === normTexto(atual)) return;
    p.dados.nome_completo = nome;
    if (!alvo.apelido && atual) p.dados.apelido = atual;
    if (p.acao === 'igual') p.acao = 'atualizar';
    if (!plano.motoristas.includes(p)) plano.motoristas.push(p);
  };

  for (const r of regs('motoristas')) {
    const d: Row = { ...r.campos };
    if (d.cpf) d.cpf = soDigitos(d.cpf).length === 11 ? soDigitos(d.cpf) : undefined;
    if (typeof d.vinculo === 'string') d.frota_propria = normTexto(d.vinculo).startsWith('frota propria');
    if (d.mopp_texto !== undefined) {
      const m = lerMopp(d.mopp_texto);
      if (m.mopp !== undefined) d.mopp = m.mopp;
      if (m.mopp_validade && !d.mopp_validade) d.mopp_validade = m.mopp_validade;
      if (m.mopp === undefined) r.extras.MOPP = d.mopp_texto;
      delete d.mopp_texto;
    }
    if (typeof d.rg === 'number') d.rg = String(d.rg);
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
    const ex = veiculoPorPlaca.get(chavePlaca(placa));
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
    // Aba "CARRETAS" com TIPO = "ABERTA": o nome da aba diz que é carreta.
    const abaN = ` ${normTexto(r.aba)} `;
    const daAba = / carreta| reboque| semi/.test(abaN) ? 'carreta' : / cavalo| trator/.test(abaN) ? 'cavalo' : '';
    const tipo = tipoVeiculoDe(c.tipo_unidade, c.tipo_desc) ?? (daAba ? tipoVeiculoDe(daAba, c.tipo_desc) : null);
    // "Semi-Reboque" (genérico) de outra aba não apaga o "ABERTA"/"SIDER" já conhecido.
    const tipoAtual = (planoVeiculo.get(placa)?.dados.tipo ?? veiculoPorPlaca.get(chavePlaca(placa))?.tipo) as unknown;
    if (tipo && !(tipo === 'CARRETA_OUTRO' && typeof tipoAtual === 'string' && tipoAtual.startsWith('CARRETA_'))) d.tipo = tipo;
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
    let extras: Row = { ...r.extras, ...(c.situacao && !sit ? { Situação: c.situacao } : {}) };
    // Aba de um assunto só (REVISÃO TÉCNICA, CRONOTACÓGRAFO): "Status", "Periodicidade"... são
    // daquele documento — o nome da aba entra na chave para não misturar com as outras abas.
    if (!/ veicul| frota| cavalo| carreta| placas| opentec/.test(abaN))
      extras = Object.fromEntries(Object.entries(extras).map(([k, v]) => [`${r.aba} › ${k}`, v]));
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
  // Documento -> viagens (um CRT dividido entre caminhões aparece em mais de uma viagem).
  const porDocumento = new Map<string, Row[]>();
  const indexarDoc = (n: unknown, v: Row) => {
    const k = String(n).toUpperCase();
    const lista = porDocumento.get(k) ?? [];
    if (!lista.includes(v)) porDocumento.set(k, [...lista, v]);
  };
  for (const v of base.viagens) {
    if (v.codigo_externo) porCodigo.set(normTexto(v.codigo_externo), v);
    if (v.numero_crt) indexarDoc(v.numero_crt, v);
    for (const c of base.cargasPorViagem.get(String(v.id)) ?? []) indexarDoc(c.numero_documento, v);
    if (!STATUS_VIAGEM_TERMINAIS.includes(v.status as StatusViagem)) {
      const p = chavePlaca(v.placa_cavalo);
      ativasPorPlaca.set(p, [...(ativasPorPlaca.get(p) ?? []), v]);
    }
  }
  const usadas = new Set<string>();
  const planoPorChave = new Map<string, PlanoViagem>();
  const assinaturas = new Map<PlanoViagem, Set<string>>();
  const extrasDe = new Map<PlanoViagem, { cargasAntes: ViagemCargaInput[]; motoristaNovo: boolean; fonte: string }>();
  let linhasDuplicadas = 0;

  /** Junta mais uma linha (lote/CRT) à viagem: pesos dos lotes somam, textos se acumulam. */
  const juntarLinha = (pv: PlanoViagem, dados: Row, cargas: ViagemCargaInput[]) => {
    const soma = (a: unknown, b: unknown) =>
      typeof a === 'number' && typeof b === 'number' ? Math.round((a + b) * 1000) / 1000 : (a ?? b);
    for (const nova of cargas) {
      const i = pv.cargas.findIndex((x) => x.numero_documento === nova.numero_documento);
      if (i < 0) {
        pv.cargas.push(nova);
        continue;
      }
      const atual = pv.cargas[i]!;
      pv.cargas[i] = {
        ...atual,
        mercadoria: atual.mercadoria ?? nova.mercadoria,
        tipo_mercadoria: atual.tipo_mercadoria ?? nova.tipo_mercadoria,
        moeda: atual.moeda ?? nova.moeda,
        peso_kg: soma(atual.peso_kg, nova.peso_kg) as number | null,
        valor_mercadoria: soma(atual.valor_mercadoria, nova.valor_mercadoria) as number | null,
      };
    }
    const d = pv.dados;
    for (const [k, v] of Object.entries(dados)) {
      if (v === undefined || v === null || k === 'numero_crt') continue;
      if (k === 'peso_kg' || k === 'valor_mercadoria') {
        if (cargas.length === 0) d[k] = soma(d[k], v);
      } else if (k === 'dados_extras') {
        const ex = { ...((d.dados_extras as Row | undefined) ?? {}) };
        for (const [ck, cv] of Object.entries(v as Row)) {
          const antes = ex[ck];
          if (antes === undefined || antes === '') ex[ck] = cv;
          else if (!String(antes).split(' | ').includes(String(cv))) ex[ck] = `${String(antes)} | ${String(cv)}`;
        }
        d.dados_extras = ex;
      } else if (k === 'observacoes') {
        if (!String(d.observacoes ?? '').includes(String(v))) d.observacoes = d.observacoes ? `${String(d.observacoes)} | ${String(v)}` : v;
      } else if (k === 'data_entrega') {
        if (!d.data_entrega || Date.parse(String(v)) > Date.parse(String(d.data_entrega))) d.data_entrega = v;
      } else if (d[k] === undefined) d[k] = v;
    }
  };

  // Retrato diário da frota (um cavalo por dia): os dias de cada viagem viram uma viagem só.
  // Linhas com data vêm antes das sem data: o retrato atual da frota ("Controle de Frota", sem
  // data) completa a viagem em andamento do cavalo em vez de abrir outra.
  const linhasViagem: Registro[] = [];
  for (const a of abas.filter((x) => x.tipo === 'viagens')) {
    const retrato = consolidarRetratoDiario(a.registros);
    if (retrato) {
      plano.avisos.push(
        `${a.info.arquivo} › ${a.info.aba}: retrato diário da frota — ${retrato.dias} linha(s) (um cavalo por dia) consolidadas em ${retrato.viagens} viagem(ns)` +
          (retrato.descartados > 0 ? `; ${retrato.descartados} trecho(s) sem rota e já terminados foram ignorados.` : '.'),
      );
      linhasViagem.push(...retrato.registros);
    } else linhasViagem.push(...a.registros);
  }
  const temData = (r: Registro) => !!(r.campos.data_coleta ?? r.campos.data_programacao ?? r.campos.data_entrega);
  linhasViagem.sort((a, b) => Number(temData(b)) - Number(temData(a)));
  /** Viagem do plano, ainda aberta, de cada cavalo (a mais recente). */
  const abertaDoCavalo = new Map<string, PlanoViagem>();
  // Viagens do banco por cavalo + dia (reimportação de viagem sem ID nem CRT não duplica).
  const porPlacaDia = new Map<string, Row>();
  for (const v of base.viagens) {
    const d = [v.data_coleta, v.data_programacao].find((x): x is string => typeof x === 'string');
    if (d) porPlacaDia.set(`${chavePlaca(v.placa_cavalo)}|${d.slice(0, 10)}`, v);
  }

  for (const r of linhasViagem) {
    const c = r.campos;
    const placa = c.placa_cavalo as string | undefined;
    const fonte = `${r.arquivo} › ${r.aba} (linha ${r.linha})`;
    if (!placa) {
      plano.erros.push({ arquivo: r.arquivo, aba: r.aba, linha: r.linha, mensagem: 'Viagem sem placa do cavalo válida — linha ignorada' });
      continue;
    }
    const codigo = c.codigo_externo ? String(c.codigo_externo).trim() : null;

    // "RETORNANDO VAZIO DA BALL PY" / "RETORNOU FRIMETAL" na coluna de cliente é situação, não nome.
    const lido = clienteDoTexto(c.cliente);
    let cliente = lido.cliente;
    const textoCliente: string | null = lido.retorno ? String(c.cliente) : null;
    // Planilha de frota com ida e volta: sem ida preenchida, a viagem atual é a perna de volta.
    let origem = c.origem as string | undefined;
    let destino = c.destino as string | undefined;
    if (typeof c.cliente_retorno === 'string' && /^vazi[oa]$/i.test(c.cliente_retorno.trim())) delete c.cliente_retorno;
    if (!origem && !destino && !cliente && (c.origem_retorno || c.destino_retorno || c.cliente_retorno)) {
      origem = c.origem_retorno as string | undefined;
      destino = c.destino_retorno as string | undefined;
      cliente = c.cliente_retorno as string | undefined;
    } else if (c.origem_retorno || c.destino_retorno || c.cliente_retorno) {
      r.extras['Retorno'] = [c.cliente_retorno, c.origem_retorno, c.destino_retorno].filter(Boolean).join(' · ');
    }

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

    // Status: regras sobre status -> localização -> observação -> cliente; depois a IA; depois Sim/Não.
    let status: StatusViagem | null = null;
    const textoStatus = typeof c.status_texto === 'string' ? c.status_texto : null;
    const textoObs = typeof c.observacoes === 'string' ? c.observacoes : null;
    const doDetalhe = statusViagemDeTexto(c.localizacao) ?? statusViagemDeTexto(textoObs);
    status = refinarStatus(statusViagemDeTexto(textoStatus), doDetalhe);
    if (!status && textoCliente) status = statusViagemDeTexto(textoCliente);
    for (const t of [textoStatus, textoObs]) if (!status && t) status = statusIa.get(t) ?? null;
    if (!status) {
      if (c.descarregou === true) status = 'VAZIO_NO_CLIENTE';
      else if (c.chegou === true) status = 'CHEGADA_CLIENTE';
      else if (c.em_fronteira === true) status = 'NA_FRONTEIRA';
      else if (c.em_viagem === true) status = 'EM_TRANSITO_FRONTEIRA';
      else if (c.carregou === true) status = 'CARREGADO_AGUARDANDO_DOCUMENTOS';
    }
    if (status) status = STATUS_VIAGEM_LEGADO_PARA_ATUAL[status] ?? status;
    // Planilha histórica: entregue/sem etapa e com data de fim já passada = viagem encerrada
    // (senão centenas de viagens antigas ficariam "em andamento" no acompanhamento).
    if (
      (!status || status === 'VAZIO_NO_CLIENTE' || status === 'CHEGADA_CLIENTE') &&
      typeof c.data_entrega === 'string' &&
      Date.now() - Date.parse(c.data_entrega) > 3 * 86400000
    )
      status = 'ENCERRADA';
    if (status) plano.cruzamentos.status_deduzidos++;

    // Planilha-retrato da frota (sem datas): a linha também diz a situação do veículo. Linha que
    // só fala do veículo (manutenção, sem motorista, sem rota) não vira viagem.
    const dataLinha = (c.data_coleta ?? c.data_programacao ?? c.data_entrega) as string | undefined;
    const textos = ` ${normTexto([textoStatus, textoObs, textoCliente].filter(Boolean).join(' '))} `;
    const emManutencao = / manutenc| oficina /.test(textos);
    const soVeiculo = emManutencao || (!status && !codigo && cargas.length === 0 && !origem && !destino && !cliente);
    if (!dataLinha) {
      const situacao = emManutencao
        ? 'MANUTENCAO'
        : / sem motorista /.test(textos)
          ? 'GARAGEM'
          : status === 'ENCERRADA'
            ? 'DISPONIVEL'
            : null;
      if (situacao)
        registrarVeiculo(
          placa,
          {
            status_operacional: situacao,
            ...(emManutencao && (cliente || destino) ? { localizacao_atual: [cliente, destino].filter(Boolean).join(' — ') } : {}),
            ...(textoObs ? { observacoes_acompanhamento: textoObs } : {}),
          },
          false,
        );
    }
    if (soVeiculo) {
      registrarVeiculo(placa, { tipo: 'CAVALO' }, true);
      for (const pc of [c.placa_carreta, c.placa_carreta_2])
        if (typeof pc === 'string') registrarVeiculo(pc, { tipo: 'CARRETA_OUTRO' }, true);
      continue;
    }

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

    // Cadastro novo que só aparece em planilha de viagens com data (histórico de embarques, ex.:
    // VEGA) é de transportador/agregado: entra como terceiro, não como frota própria. Quem já
    // existe (ou veio antes da planilha da frota) não muda.
    // Motorista novo num cavalo da frota própria (histórico da própria frota) continua próprio.
    const nMotoristas = plano.motoristas.length;
    const nVeiculos = plano.veiculos.length;
    const cavaloPlano = planoVeiculo.get(placa);
    const cavaloAntes = cavaloPlano
      ? { ...(cavaloPlano.existente ?? {}), ...cavaloPlano.dados }
      : veiculoPorPlaca.get(chavePlaca(placa));
    const cavaloProprio = !!cavaloAntes && cavaloAntes.frota_propria !== false;
    const marcarTerceiros = () => {
      // Retrato diário é da própria frota; só histórico de embarques (VEGA) traz terceiros.
      if (!dataLinha || r.retrato) return;
      if (!cavaloProprio)
        for (const p of plano.motoristas.slice(nMotoristas)) if (p.acao === 'criar') p.dados.frota_propria = false;
      for (const p of plano.veiculos.slice(nVeiculos)) if (p.acao === 'criar') p.dados.frota_propria = false;
    };

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
      if (motoristaPlano && typeof c.motorista_nome === 'string') completarNome(motoristaPlano, c.motorista_nome);
      if (!motoristaPlano && c.motorista_codigo)
        plano.avisos.push(`${fonte}: motorista de código ${String(c.motorista_codigo)} não encontrado e sem nome na planilha.`);
    }

    // Cliente citado na viagem vira cadastro de cliente (se ainda não existir).
    if (cliente) registrarCliente({ nome: cliente });

    // Veículos: cavalo e carretas existem? senão são cadastrados (placa + tipo).
    const tipoTexto =
      Object.entries(r.extras).find(([k]) => /^tipo (de )?veiculo$/.test(normTexto(k).replace(/^[^a-z]+/, '')))?.[1] ?? '';
    registrarVeiculo(placa, { tipo: 'CAVALO' }, true);
    for (const pc of [c.placa_carreta, c.placa_carreta_2])
      if (typeof pc === 'string') registrarVeiculo(pc, { tipo: tipoVeiculoDe('carreta', tipoTexto) ?? 'CARRETA_OUTRO' }, true);
    marcarTerceiros();

    const pais = paisDe(c.pais_destino) ?? paisDe(destino);
    const peso =
      typeof c.peso_kg === 'number' ? c.peso_kg : typeof c.peso_t === 'number' ? Math.round(c.peso_t * 1000) : undefined;
    const extras: Row = { ...r.extras };
    if (typeof c.localizacao === 'string') extras['Localização atual'] = c.localizacao;
    if (textoStatus && !statusViagemDeTexto(textoStatus)) extras['Status (texto da planilha)'] = textoStatus;
    const dados: Row = {
      codigo_externo: codigo ?? undefined,
      placa_cavalo: placaCadastro(placa),
      placa_carreta: placaCadastro(c.placa_carreta),
      placa_carreta_2: placaCadastro(c.placa_carreta_2),
      cliente,
      origem,
      destino,
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
      data_encerramento: c.data_encerramento,
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

    // Mesma viagem em várias linhas do arquivo (uma linha por lote/CRT): mesmo ID, ou mesmo
    // cavalo no mesmo dia de coleta, ou mesmo cavalo + mesmo CRT. O CRT sozinho não identifica a
    // viagem: um CRT pode ser dividido entre dois caminhões.
    const diaViagem = [c.data_coleta, c.data_programacao].find((x): x is string => typeof x === 'string')?.slice(0, 10);
    const chaveLocal = codigo
      ? `v:${normTexto(codigo)}`
      : diaViagem
        ? `t:${chavePlaca(placa)}|${diaViagem}`
        : dados.numero_crt
          ? `d:${chavePlaca(placa)}|${String(dados.numero_crt)}`
          : null;
    const repetida = chaveLocal ? planoPorChave.get(chaveLocal) : undefined;
    if (repetida) {
      // Linha idêntica a outra já lida (copiada duas vezes na planilha): ignora.
      const assinatura = JSON.stringify([c, r.extras]);
      const vistas = assinaturas.get(repetida)!;
      if (vistas.has(assinatura)) {
        linhasDuplicadas++;
        continue;
      }
      vistas.add(assinatura);
      juntarLinha(repetida, dados, cargas);
      repetida.fontes.push(fonte);
      repetida.previa.fontes.push(fonte);
      continue;
    }

    // Retrato atual da frota (sem data) de um cavalo que já tem viagem aberta nesta importação
    // (vinda do histórico): é a mesma viagem, e o retrato é a informação mais recente.
    if (!dataLinha && !codigo) {
      const aberta = abertaDoCavalo.get(chavePlaca(placa));
      const clienteAberta = aberta?.dados.cliente;
      if (aberta && (!cliente || !clienteAberta || normTexto(clienteAberta) === normTexto(cliente))) {
        const novoStatus = dados.status;
        juntarLinha(aberta, dados, cargas);
        if (novoStatus) aberta.dados.status = novoStatus;
        if (typeof c.observacoes === 'string') aberta.dados.observacoes = c.observacoes;
        aberta.fontes.push(fonte);
        aberta.previa.fontes.push(fonte);
        continue;
      }
    }

    // Casa com uma viagem já cadastrada: ID da planilha -> CRT/DANFE (mesmo cavalo) -> viagem ativa do cavalo.
    let existente: Row | null = null;
    if (codigo) existente = porCodigo.get(normTexto(codigo)) ?? null;
    if (!existente)
      for (const cg of cargas) {
        const e = (porDocumento.get(cg.numero_documento) ?? []).find(
          (v) => chavePlaca(v.placa_cavalo) === chavePlaca(placa) && !usadas.has(String(v.id)),
        );
        if (e) {
          existente = e;
          break;
        }
      }
    if (!existente && diaViagem) {
      const e = porPlacaDia.get(`${chavePlaca(placa)}|${diaViagem}`);
      if (e && !usadas.has(String(e.id))) existente = e;
    }
    if (!existente) {
      // Linha histórica (já encerrada, com data) nunca fecha a viagem que o cavalo está fazendo
      // agora: só casa com uma viagem apenas programada e de data próxima.
      const historica = dados.status === 'ENCERRADA' && !!dataLinha;
      const candidatas = (ativasPorPlaca.get(chavePlaca(placa)) ?? []).filter((v) => {
        if (usadas.has(String(v.id))) return false;
        if (historica) {
          if (v.status !== 'PROGRAMADA' || !dataLinha || typeof v.data_programacao !== 'string') return false;
          if (Math.abs(Date.parse(dataLinha) - Date.parse(v.data_programacao)) / 86400000 > 5) return false;
        }
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
    // Retrato da frota dizendo "voltou vazio ao pátio" sem viagem aberta: nada a encerrar.
    if (!existente && dados.status === 'ENCERRADA' && !dataLinha) continue;

    const cargasAntes = existente ? (base.cargasPorViagem.get(String(existente.id)) ?? []) : [];
    if (motoristaPlano?.existente) dados.motorista_id = motoristaPlano.existente.id;

    const pv: PlanoViagem = {
      acao: existente ? 'atualizar' : 'criar',
      ref: chaveLocal ?? `linha:${r.arquivo}:${r.aba}:${r.linha}`,
      existente,
      // Completo durante a leitura; a diferença com o banco é calculada depois de juntar as linhas.
      dados,
      motoristaRef: motoristaPlano?.ref ?? null,
      // Só os documentos da planilha: os lotes somam entre si; o banco entra no fechamento.
      cargas: mesclarCargas([], cargas),
      cargasMudaram: false,
      statusAnterior: (existente?.status as StatusViagem | undefined) ?? null,
      motoristaAnteriorId: (existente?.motorista_id as string | undefined) ?? null,
      fontes: [fonte],
      previa: {
        acao: existente ? 'atualizar' : 'criar',
        chave: codigo ?? String(dados.numero_crt ?? placa),
        placa_cavalo: placa,
        placa_carreta: (c.placa_carreta as string) ?? (existente?.placa_carreta as string) ?? null,
        motorista: (motoristaPlano?.existente?.nome_completo as string) ?? (motoristaPlano?.dados.nome_completo as string) ?? null,
        cliente: cliente ?? null,
        origem: '',
        destino: '',
        status: '',
        data_programacao: (dados.data_programacao as string) ?? null,
        documentos: [],
        pesquisa_ok: pesquisa,
        checklist_ok: checklist,
        smp_ok: smp,
        fontes: [fonte],
      },
    };
    extrasDe.set(pv, { cargasAntes, motoristaNovo: !!motoristaPlano && !motoristaPlano.existente, fonte });
    assinaturas.set(pv, new Set([JSON.stringify([c, r.extras])]));
    plano.viagens.push(pv);
    if (chaveLocal) planoPorChave.set(chaveLocal, pv);
    if (!STATUS_VIAGEM_TERMINAIS.includes((dados.status ?? existente?.status ?? 'PROGRAMADA') as StatusViagem)) {
      const antes = abertaDoCavalo.get(chavePlaca(placa));
      const dataDe = (x: PlanoViagem) => String(x.dados.data_programacao ?? x.dados.data_coleta ?? '');
      if (!antes || dataDe(pv) >= dataDe(antes)) abertaDoCavalo.set(chavePlaca(placa), pv);
    }
  }

  // ----- fecha cada viagem: diferença com o banco, padrões de viagem nova, prévia ----------
  // `viagens.numero_crt` é único no banco, mas um CRT pode ser dividido entre vários caminhões:
  // o CRT "principal" de cada viagem é um que nenhuma outra viagem usa (todos ficam em cargas).
  const crtOcupado = new Map<string, unknown>();
  for (const v of base.viagens) if (v.numero_crt) crtOcupado.set(String(v.numero_crt).toUpperCase(), v.id);
  for (const pv of plano.viagens) {
    const { cargasAntes, motoristaNovo, fonte } = extrasDe.get(pv)!;
    const dados = pv.dados;
    // Documento que está no banco e não na planilha é mantido; o que está nos dois fica com a planilha.
    pv.cargas = mesclarCargas(cargasAntes, pv.cargas);
    const pesos = pv.cargas.map((x) => x.peso_kg).filter((x): x is number => typeof x === 'number');
    if (pesos.length > 0) dados.peso_kg = Math.round(pesos.reduce((a, b) => a + b, 0) * 1000) / 1000;
    const dono = pv.existente?.id ?? pv;
    const livre = (n: string) => !crtOcupado.has(n) || crtOcupado.get(n) === dono;
    if (pv.existente?.numero_crt && pv.cargas.some((x) => x.numero_documento === String(pv.existente!.numero_crt).toUpperCase()))
      dados.numero_crt = String(pv.existente.numero_crt).toUpperCase();
    else {
      const docs = [...pv.cargas].sort((a, b) => Number(b.tipo_documento === 'CRT') - Number(a.tipo_documento === 'CRT'));
      dados.numero_crt = docs.map((x) => x.numero_documento).find(livre) ?? undefined;
      if (dados.numero_crt === undefined) delete dados.numero_crt;
    }
    if (typeof dados.numero_crt === 'string') crtOcupado.set(dados.numero_crt, dono);
    pv.cargasMudaram = !cargaIgual(pv.cargas, cargasAntes);
    if (pv.existente) {
      pv.dados = diferenca(dados, pv.existente);
      pv.acao = Object.keys(pv.dados).length > 0 || pv.cargasMudaram || motoristaNovo ? 'atualizar' : 'igual';
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
    Object.assign(pv.previa, {
      acao: pv.acao,
      origem: String(dados.origem ?? pv.existente?.origem ?? ''),
      destino: String(dados.destino ?? pv.existente?.destino ?? ''),
      status: String(dados.status ?? pv.existente?.status ?? 'PROGRAMADA'),
      documentos: pv.cargas.map((x) => `${x.tipo_documento} ${x.numero_documento}`),
    });
  }
  if (linhasDuplicadas > 0)
    plano.avisos.push(`${linhasDuplicadas} linha(s) idêntica(s) a outra da mesma viagem foram ignoradas (duplicadas na planilha).`);

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
