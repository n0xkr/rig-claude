import type { EntidadeCadastro, OpcaoPergunta } from '@rigabras/shared';
import { RESPOSTA_EXTRA } from '@rigabras/shared';
import { comoPlaca, iguais, lerValor, normTexto, valorBruto, type TipoCampo } from './leitura.js';

/**
 * Definição declarativa de cada entidade que a IA sabe cadastrar a partir de
 * planilhas. Para "ensinar" uma aba nova à IA basta acrescentar uma definição
 * aqui (+ a tabela na migration): `colunas` diz o que cada cabeçalho significa —
 * conhecimento que vem do próprio dicionário da planilha da Rigabras, NUNCA de
 * suposição. Cabeçalho que não estiver aqui vira uma PERGUNTA ao administrador.
 */

export interface CampoDef {
  label: string;
  tipo: TipoCampo;
  /** Campo auxiliar: usado só para derivar outros, não vira coluna do banco. */
  aux?: boolean;
}

export type ColDef = { campo: string } | { extra: true } | { ignorar: true };

export interface PerguntaCampo {
  campo: string;
  pergunta: string;
  opcoes: OpcaoPergunta[];
  entrada: 'OPCAO' | 'TEXTO';
}

export interface EntidadeDef {
  entidade: EntidadeCadastro;
  rotulo: string;
  tabela: string;
  /** Nomes de aba (normTexto) que esta entidade reconhece. */
  abas: string[];
  campos: Record<string, CampoDef>;
  /** normTexto(cabeçalho) -> significado. */
  colunas: Record<string, ColDef>;
  obrigatorios: string[];
  /** Chaves que identificam o registro, da mais forte para a mais fraca. */
  chavesDoNovo(dados: Record<string, unknown>): string[];
  chavesDoExistente(row: Record<string, unknown>): string[];
  /** Chave "principal" gravada em `chave_natural` da solicitação. */
  chavePrincipal(dados: Record<string, unknown>): string | null;
  titulo(dados: Record<string, unknown>): string;
  /** Regras que dependem de vários campos; devolve o que NÃO conseguiu decidir (vira pergunta). */
  derivar(
    dados: Record<string, unknown>,
    extras: Record<string, unknown>,
  ): { perguntas: PerguntaCampo[]; avisos: string[] };
  /** Colunas extras que a tabela exige ao gravar (ex.: nome_normalizado). */
  completarParaGravar?(dados: Record<string, unknown>): Record<string, unknown>;
  validar(dados: Record<string, unknown>): string | null;
}

const c = (campo: string): ColDef => ({ campo });
const EXTRA: ColDef = { extra: true };
const IGN: ColDef = { ignorar: true };

export const TIPOS_VEICULO = [
  'CAVALO',
  'CARRETA_ABERTA',
  'CARRETA_SIDER',
  'CARRETA_OUTRO',
] as const;
export const STATUS_OPERACIONAL = ['DISPONIVEL', 'EM_TRANSITO', 'MANUTENCAO', 'GARAGEM'] as const;

export const OPCOES_TIPO_VEICULO: OpcaoPergunta[] = [
  { valor: 'CAVALO', rotulo: 'Cavalo mecânico' },
  { valor: 'CARRETA_ABERTA', rotulo: 'Carreta aberta' },
  { valor: 'CARRETA_SIDER', rotulo: 'Carreta sider' },
  { valor: 'CARRETA_OUTRO', rotulo: 'Outro tipo de carreta/reboque (baú, bitrem, rodotrem...)' },
];

const frotaPropria = (vinculo: unknown): boolean | undefined => {
  if (typeof vinculo !== 'string' || vinculo.trim() === '') return undefined;
  return normTexto(vinculo).startsWith('frota propria');
};

const semVazios = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));

// ---------------------------------------------------------------------------
// Veículos (cavalos e reboques)
// ---------------------------------------------------------------------------
const veiculos: EntidadeDef = {
  entidade: 'veiculos',
  rotulo: 'Veículo',
  tabela: 'veiculos',
  abas: ['veiculos'],
  campos: {
    placa: { label: 'Placa', tipo: 'plate' },
    tipo_unidade: { label: 'Tipo de unidade', tipo: 'text', aux: true },
    tipo_veiculo_desc: { label: 'Tipo de veículo', tipo: 'text', aux: true },
    situacao: { label: 'Situação', tipo: 'text', aux: true },
    capacidade_t: { label: 'Capacidade (t)', tipo: 'number', aux: true },
    marca: { label: 'Marca', tipo: 'text' },
    modelo: { label: 'Modelo', tipo: 'text' },
    ano_fabricacao: { label: 'Ano de fabricação', tipo: 'int' },
    capacidade_m3: { label: 'Capacidade (m³)', tipo: 'number' },
    vinculo: { label: 'Vínculo', tipo: 'text' },
    proprietario: { label: 'Proprietário', tipo: 'text' },
    rntrc_numero: { label: 'RNTRC nº', tipo: 'text' },
    rntrc_validade: { label: 'RNTRC validade', tipo: 'date' },
    crlv_validade: { label: 'CRLV validade', tipo: 'date' },
    inspecao_tecnica_validade: { label: 'Inspeção técnica validade', tipo: 'date' },
    tacografo_validade: { label: 'Tacógrafo validade', tipo: 'date' },
    observacoes_acompanhamento: { label: 'Observação', tipo: 'text' },
    // Preenchidos por `derivar`:
    tipo: { label: 'Tipo (cavalo/carreta)', tipo: 'text' },
    capacidade_kg: { label: 'Capacidade (kg)', tipo: 'number' },
    frota_propria: { label: 'Frota própria', tipo: 'sn' },
    status_operacional: { label: 'Situação operacional', tipo: 'text' },
  },
  colunas: {
    placa: c('placa'),
    'tipo unidade': c('tipo_unidade'),
    'tipo de veiculo': c('tipo_veiculo_desc'),
    marca: c('marca'),
    modelo: c('modelo'),
    ano: c('ano_fabricacao'),
    'capacidade t': c('capacidade_t'),
    'capacidade m3': c('capacidade_m3'),
    vinculo: c('vinculo'),
    proprietario: c('proprietario'),
    'rntrc n': c('rntrc_numero'),
    'rntrc validade': c('rntrc_validade'),
    'crlv validade': c('crlv_validade'),
    'inspecao tecnica validade': c('inspecao_tecnica_validade'),
    'lic compl ar': EXTRA,
    'lic compl cl': EXTRA,
    'lic compl py': EXTRA,
    'lic compl uy': EXTRA,
    'lic compl bo': EXTRA,
    'lic compl pe': EXTRA,
    'tacografo validade': c('tacografo_validade'),
    situacao: c('situacao'),
    observacao: c('observacoes_acompanhamento'),
    'ultima atualizacao': IGN,
    // derivadas na planilha (fórmulas):
    'rastreador principal': IGN,
    'consulta veiculo gr valida': IGN,
    'proximo vencimento': IGN,
    'dias p proximo vencimento': IGN,
  },
  obrigatorios: ['placa'],
  chavesDoNovo: (d) => (d.placa ? [`placa:${d.placa}`] : []),
  chavesDoExistente: (r) => (r.placa ? [`placa:${String(r.placa).toUpperCase()}`] : []),
  chavePrincipal: (d) => (typeof d.placa === 'string' ? d.placa : null),
  titulo: (d) =>
    `${d.tipo === 'CAVALO' ? 'Cavalo' : d.tipo ? 'Reboque' : 'Veículo'} ${d.placa}${d.marca ? ` — ${d.marca}${d.modelo ? ` ${d.modelo}` : ''}` : ''}`,
  derivar(d, extras) {
    const perguntas: PerguntaCampo[] = [];
    const avisos: string[] = [];

    if (d.tipo === undefined) {
      const unidade = normTexto(d.tipo_unidade);
      const desc = normTexto(d.tipo_veiculo_desc);
      const ref = unidade || desc;
      if (ref.startsWith('cavalo')) d.tipo = 'CAVALO';
      else if (ref.startsWith('carreta')) {
        if (desc.includes('sider')) d.tipo = 'CARRETA_SIDER';
        else if (desc.includes('aberta')) d.tipo = 'CARRETA_ABERTA';
        else if (/(bau|bitrem|rodotrem|graneleir|prancha|tanque|cacamba)/.test(desc))
          d.tipo = 'CARRETA_OUTRO';
      }
      if (d.tipo === undefined) {
        const original = [d.tipo_unidade, d.tipo_veiculo_desc].filter(Boolean).join(' / ');
        perguntas.push({
          campo: 'tipo',
          pergunta: `A placa ${d.placa} é de que tipo de veículo?${original ? ` (a planilha diz: "${original}")` : ' (a planilha não informa o tipo)'}`,
          opcoes: OPCOES_TIPO_VEICULO,
          entrada: 'OPCAO',
        });
      }
    }

    if (d.situacao !== undefined && d.status_operacional === undefined) {
      const s = normTexto(d.situacao);
      const mapa: Record<string, string> = {
        disponivel: 'DISPONIVEL',
        'em viagem': 'EM_TRANSITO',
        'em transito': 'EM_TRANSITO',
        manutencao: 'MANUTENCAO',
        garagem: 'GARAGEM',
      };
      if (mapa[s]) d.status_operacional = mapa[s];
      else {
        extras['Situação (texto original da planilha)'] = String(d.situacao);
        perguntas.push({
          campo: 'status_operacional',
          pergunta: `A situação "${String(d.situacao)}" (placa ${d.placa}) não existe no sistema. Qual situação operacional usar?`,
          opcoes: [
            { valor: 'DISPONIVEL', rotulo: 'Disponível' },
            { valor: 'EM_TRANSITO', rotulo: 'Em trânsito (em viagem)' },
            { valor: 'MANUTENCAO', rotulo: 'Em manutenção' },
            { valor: 'GARAGEM', rotulo: 'Na garagem' },
            {
              valor: RESPOSTA_EXTRA,
              rotulo: `Não informar situação — guardar "${String(d.situacao)}" só como informação extra`,
            },
          ],
          entrada: 'OPCAO',
        });
      }
    }
    if (typeof d.capacidade_t === 'number' && d.capacidade_kg === undefined) {
      // O cabeçalho da coluna diz explicitamente "(t)": conversão exata, sem suposição.
      d.capacidade_kg = Math.round(d.capacidade_t * 1000 * 100) / 100;
    }
    const fp = frotaPropria(d.vinculo);
    if (fp !== undefined && d.frota_propria === undefined) d.frota_propria = fp;
    if (d.frota_propria === undefined) {
      // Só registra a ressalva no próprio cadastro (um aviso por linha seria ruído).
      extras['Vínculo'] = 'não informado na planilha (frota própria é o padrão do sistema)';
    }
    return { perguntas, avisos };
  },
  validar(d) {
    if (typeof d.placa !== 'string' || !comoPlaca(d.placa)) return 'Placa inválida';
    if (d.tipo === undefined || !(TIPOS_VEICULO as readonly string[]).includes(String(d.tipo)))
      return 'Tipo do veículo não definido';
    if (
      d.status_operacional !== undefined &&
      !(STATUS_OPERACIONAL as readonly string[]).includes(String(d.status_operacional))
    )
      return 'Situação operacional inválida';
    if (
      typeof d.ano_fabricacao === 'number' &&
      (d.ano_fabricacao < 1980 || d.ano_fabricacao > 2100)
    )
      return 'Ano de fabricação fora do intervalo 1980–2100';
    return null;
  },
};

// ---------------------------------------------------------------------------
// Motoristas
// ---------------------------------------------------------------------------
const motoristas: EntidadeDef = {
  entidade: 'motoristas',
  rotulo: 'Motorista',
  tabela: 'motoristas',
  abas: ['motoristas'],
  campos: {
    codigo_externo: { label: 'ID do motorista', tipo: 'text' },
    nome_completo: { label: 'Nome', tipo: 'text' },
    apelido: { label: 'Apelido', tipo: 'text' },
    vinculo: { label: 'Vínculo', tipo: 'text' },
    nacionalidade: { label: 'Nacionalidade', tipo: 'text' },
    data_admissao: { label: 'Data de admissão/contrato', tipo: 'date' },
    cnh_categoria: { label: 'CNH categoria', tipo: 'text' },
    cnh_validade: { label: 'CNH validade', tipo: 'date' },
    cnh_ear: { label: 'CNH com EAR', tipo: 'sn' },
    toxicologico_data: { label: 'Toxicológico — data do exame', tipo: 'date' },
    toxicologico_vencimento: { label: 'Toxicológico — vencimento', tipo: 'date' },
    mopp: { label: 'MOPP', tipo: 'sn' },
    mopp_validade: { label: 'MOPP validade', tipo: 'date' },
    doc_viagem_tipo: { label: 'Documento de viagem — tipo', tipo: 'text' },
    doc_viagem_validade: { label: 'Documento de viagem — validade', tipo: 'date' },
    treinamento_pgr_data: { label: 'Treinamento PGR/macros — data', tipo: 'date' },
    placa_habitual: { label: 'Placa habitual', tipo: 'plate' },
    ativo: { label: 'Ativo', tipo: 'sn' },
    observacao: { label: 'Observação', tipo: 'text' },
    frota_propria: { label: 'Frota própria', tipo: 'sn' },
  },
  colunas: {
    'id motorista': c('codigo_externo'),
    nome: c('nome_completo'),
    apelido: c('apelido'),
    vinculo: c('vinculo'),
    nacionalidade: c('nacionalidade'),
    'data admissao contrato': c('data_admissao'),
    'cnh categoria': c('cnh_categoria'),
    'cnh validade': c('cnh_validade'),
    'cnh com ear': c('cnh_ear'),
    'toxicologico data exame': c('toxicologico_data'),
    'toxicologico vencimento': c('toxicologico_vencimento'),
    mopp: c('mopp'),
    'mopp validade': c('mopp_validade'),
    'doc viagem tipo': c('doc_viagem_tipo'),
    'doc viagem validade': c('doc_viagem_validade'),
    'treinamento pgr macros data': c('treinamento_pgr_data'),
    'login autotrac': EXTRA,
    'senha coacao cadastrada': EXTRA,
    'placa habitual': c('placa_habitual'),
    ativo: c('ativo'),
    observacao: c('observacao'),
    'ultima atualizacao': IGN,
    // derivadas na planilha (fórmulas):
    'dias p vencer cnh': IGN,
    'dias p vencer toxicologico': IGN,
    'dias p vencer doc viagem': IGN,
    'validado gr': IGN,
    'validado seguradora': IGN,
    'viagens ultimos 12 meses': IGN,
    'ocorrencias 12 meses': IGN,
    'status geral': IGN,
  },
  obrigatorios: ['nome_completo'],
  chavesDoNovo: (d) => [
    ...(d.codigo_externo ? [`cod:${d.codigo_externo}`] : []),
    ...(d.nome_completo ? [`nome:${normTexto(d.nome_completo)}`] : []),
  ],
  chavesDoExistente: (r) => [
    ...(r.codigo_externo ? [`cod:${r.codigo_externo}`] : []),
    ...(r.nome_completo ? [`nome:${normTexto(r.nome_completo)}`] : []),
  ],
  chavePrincipal: (d) =>
    d.codigo_externo
      ? String(d.codigo_externo)
      : d.nome_completo
        ? normTexto(d.nome_completo)
        : null,
  titulo: (d) =>
    `Motorista ${d.nome_completo ?? d.codigo_externo}${d.codigo_externo && d.nome_completo ? ` (${d.codigo_externo})` : ''}`,
  derivar(d) {
    const fp = frotaPropria(d.vinculo);
    if (fp !== undefined && d.frota_propria === undefined) d.frota_propria = fp;
    return { perguntas: [], avisos: [] };
  },
  validar(d) {
    if (typeof d.nome_completo !== 'string' || d.nome_completo.trim().length < 3)
      return 'Nome do motorista ausente ou curto demais';
    return null;
  },
};

// ---------------------------------------------------------------------------
// Rastreadores
// ---------------------------------------------------------------------------
const rastreadores: EntidadeDef = {
  entidade: 'rastreadores',
  rotulo: 'Rastreador',
  tabela: 'rastreadores',
  abas: ['rastreadores'],
  campos: {
    codigo_externo: { label: 'ID do equipamento', tipo: 'text' },
    placa: { label: 'Placa', tipo: 'plate' },
    funcao: { label: 'Função', tipo: 'text' },
    fabricante: { label: 'Fabricante', tipo: 'text' },
    modelo: { label: 'Modelo', tipo: 'text' },
    comunicacao: { label: 'Comunicação', tipo: 'text' },
    id_terminal: { label: 'ID do terminal', tipo: 'text' },
    serial_esn: { label: 'Serial/ESN', tipo: 'text' },
    imei: { label: 'IMEI', tipo: 'text' },
    iccid_operadora: { label: 'ICCID/Operadora', tipo: 'text' },
    bateria_isca: { label: 'Bateria da isca (%)', tipo: 'int' },
    data_instalacao: { label: 'Data de instalação', tipo: 'date' },
    status: { label: 'Status', tipo: 'text' },
    homologado: { label: 'Homologado GR/seguradora', tipo: 'sn' },
    observacao: { label: 'Observação', tipo: 'text' },
  },
  colunas: {
    'id equip': c('codigo_externo'),
    placa: c('placa'),
    funcao: c('funcao'),
    fabricante: c('fabricante'),
    modelo: c('modelo'),
    comunicacao: c('comunicacao'),
    'id terminal': c('id_terminal'),
    'serial esn': c('serial_esn'),
    imei: c('imei'),
    'iccid operadora': c('iccid_operadora'),
    'cobertura exterior': EXTRA,
    bloqueador: EXTRA,
    sirene: EXTRA,
    'sensores porta cabine': EXTRA,
    'sensor bau sider': EXTRA,
    'trava bau': EXTRA,
    'sensor desengate 5 roda': EXTRA,
    'botao panico teclado': EXTRA,
    'anti jammer': EXTRA,
    'bateria isca': c('bateria_isca'),
    'data instalacao': c('data_instalacao'),
    status: c('status'),
    'homologado gr seguradora': c('homologado'),
    observacao: c('observacao'),
    'ultima atualizacao': IGN,
    // derivadas na planilha (fórmulas):
    'fabricante modelo': IGN,
    'chave oculta': IGN,
  },
  obrigatorios: [],
  chavesDoNovo: (d) => [
    ...(d.codigo_externo ? [`cod:${d.codigo_externo}`] : []),
    ...(d.placa && d.funcao ? [`placa:${d.placa}#${normTexto(d.funcao)}`] : []),
  ],
  chavesDoExistente: (r) => [
    ...(r.codigo_externo ? [`cod:${r.codigo_externo}`] : []),
    ...(r.placa && r.funcao
      ? [`placa:${String(r.placa).toUpperCase()}#${normTexto(r.funcao)}`]
      : []),
  ],
  chavePrincipal: (d) =>
    d.codigo_externo
      ? String(d.codigo_externo)
      : d.placa && d.funcao
        ? `${d.placa}#${normTexto(d.funcao)}`
        : null,
  titulo: (d) =>
    `Rastreador ${d.codigo_externo ?? d.id_terminal ?? ''}${d.funcao ? ` (${d.funcao})` : ''}${d.placa ? ` — placa ${d.placa}` : ''}`
      .replace(/\s+/g, ' ')
      .trim(),
  derivar: () => ({ perguntas: [], avisos: [] }),
  validar(d) {
    if (!d.codigo_externo && !(d.placa && d.funcao))
      return 'Rastreador sem ID do equipamento nem par placa+função';
    if (typeof d.bateria_isca === 'number' && (d.bateria_isca < 0 || d.bateria_isca > 100))
      return 'Bateria fora de 0–100%';
    return null;
  },
};

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------
const clientes: EntidadeDef = {
  entidade: 'clientes',
  rotulo: 'Cliente',
  tabela: 'clientes',
  abas: ['clientes'],
  campos: {
    codigo_externo: { label: 'ID do cliente', tipo: 'text' },
    nome: { label: 'Nome', tipo: 'text' },
    documento: { label: 'CNPJ/CUIT', tipo: 'text' },
    pais: { label: 'País', tipo: 'text' },
    tipo: { label: 'Tipo', tipo: 'text' },
    exige_gr_propria: { label: 'Exige GR própria', tipo: 'sn' },
    gr_cliente: { label: 'GR do cliente', tipo: 'text' },
    exige_espelhamento: { label: 'Exige espelhamento ao cliente', tipo: 'sn' },
    pgr_proprio: { label: 'PGR próprio', tipo: 'sn' },
    ddr: { label: 'DDR', tipo: 'sn' },
    regras: { label: 'Regras específicas', tipo: 'text' },
    contato: { label: 'Contato corporativo', tipo: 'text' },
  },
  colunas: {
    'id cliente': c('codigo_externo'),
    nome: c('nome'),
    'cnpj cuit': c('documento'),
    pais: c('pais'),
    tipo: c('tipo'),
    'exige gr propria': c('exige_gr_propria'),
    'gr do cliente': c('gr_cliente'),
    'exige espelhamento ao cliente': c('exige_espelhamento'),
    'pgr proprio': c('pgr_proprio'),
    ddr: c('ddr'),
    'regras especificas': c('regras'),
    'contato corporativo': c('contato'),
  },
  obrigatorios: ['nome'],
  chavesDoNovo: (d) => [
    ...(d.codigo_externo ? [`cod:${d.codigo_externo}`] : []),
    ...(d.nome ? [`nome:${normTexto(d.nome)}`] : []),
  ],
  chavesDoExistente: (r) => [
    ...(r.codigo_externo ? [`cod:${r.codigo_externo}`] : []),
    ...(r.nome ? [`nome:${normTexto(r.nome)}`] : []),
  ],
  chavePrincipal: (d) => (d.nome ? normTexto(d.nome) : null),
  titulo: (d) => `Cliente ${d.nome}${d.pais ? ` (${d.pais})` : ''}`,
  derivar: () => ({ perguntas: [], avisos: [] }),
  completarParaGravar: (d) => ({ ...d, nome_normalizado: normTexto(d.nome) }),
  validar(d) {
    if (typeof d.nome !== 'string' || d.nome.trim().length < 2) return 'Nome do cliente ausente';
    return null;
  },
};

// ---------------------------------------------------------------------------
// Pontos de apoio (homologados ou detectados como frequentes)
// ---------------------------------------------------------------------------
const pontosApoio: EntidadeDef = {
  entidade: 'pontos_apoio',
  rotulo: 'Ponto de apoio',
  tabela: 'pontos_apoio',
  abas: ['pontos apoio'],
  campos: {
    codigo_externo: { label: 'ID do ponto', tipo: 'text' },
    nome: { label: 'Nome', tipo: 'text' },
    tipo: { label: 'Tipo', tipo: 'text' },
    cidade: { label: 'Cidade', tipo: 'text' },
    uf: { label: 'UF/Província', tipo: 'text' },
    pais: { label: 'País', tipo: 'text' },
    latitude: { label: 'Latitude', tipo: 'number' },
    longitude: { label: 'Longitude', tipo: 'number' },
    homologado_por: { label: 'Homologado por (GR)', tipo: 'text' },
    patio_fechado: { label: 'Pátio fechado', tipo: 'sn' },
    permite_pernoite: { label: 'Permite pernoite', tipo: 'sn' },
    frequencia: { label: 'Frequência (ocorrências)', tipo: 'int' },
    observacao: { label: 'Observação', tipo: 'text' },
  },
  colunas: {
    'id ponto': c('codigo_externo'),
    nome: c('nome'),
    tipo: c('tipo'),
    cidade: c('cidade'),
    'uf provincia': c('uf'),
    pais: c('pais'),
    latitude: c('latitude'),
    longitude: c('longitude'),
    'homologado por gr': c('homologado_por'),
    'patio fechado': c('patio_fechado'),
    'permite pernoite': c('permite_pernoite'),
    observacao: c('observacao'),
  },
  obrigatorios: ['nome'],
  chavesDoNovo: (d) => (d.nome ? [`nome:${normTexto(d.nome)}`] : []),
  chavesDoExistente: (r) => (r.nome ? [`nome:${normTexto(r.nome)}`] : []),
  chavePrincipal: (d) => (d.nome ? normTexto(d.nome) : null),
  titulo: (d) =>
    `Ponto de apoio: ${d.nome}${d.frequencia ? ` (${d.frequencia}× nas planilhas)` : ''}`,
  derivar: () => ({ perguntas: [], avisos: [] }),
  completarParaGravar: (d) => ({ ...d, nome_normalizado: normTexto(d.nome) }),
  validar(d) {
    if (typeof d.nome !== 'string' || d.nome.trim().length < 2) return 'Nome do ponto ausente';
    if (typeof d.latitude === 'number' && (d.latitude < -90 || d.latitude > 90))
      return 'Latitude inválida';
    if (typeof d.longitude === 'number' && (d.longitude < -180 || d.longitude > 180))
      return 'Longitude inválida';
    return null;
  },
};

export const ENTIDADES: Record<EntidadeCadastro, EntidadeDef> = {
  veiculos,
  motoristas,
  rastreadores,
  clientes,
  pontos_apoio: pontosApoio,
};

export function entidadePorAba(abaNorm: string): EntidadeDef | null {
  return Object.values(ENTIDADES).find((e) => e.abas.includes(abaNorm)) ?? null;
}

/** Abas de documentação/derivadas do modelo de planilha da Rigabras: nada a cadastrar. */
export const ABAS_INFORMATIVAS = new Set([
  'leia me',
  'painel',
  'perfil empresa',
  'dicionario bot',
  'faq bot',
  'parametros',
  'listas',
]);

/** Abas conhecidas da planilha de controle GR cujo cadastro ainda não existe no sistema (só placas/motoristas/clientes/pontos são extraídos delas). */
export const ABAS_SEM_CADASTRO = new Set([
  'followup',
  'consultas',
  'checklists',
  'espelhamentos',
  'smp',
  'averbacoes',
  'apolices',
  'pgr regras',
  'posicoes',
  'ocorrencias',
  'sinistros',
  'fronteira',
  'contatos',
]);

// ---------------------------------------------------------------------------
// Leitura de uma linha da planilha segundo a definição da entidade
// ---------------------------------------------------------------------------
export type Destino =
  | { kind: 'campo'; campo: string }
  | { kind: 'extra' }
  | { kind: 'ignorar'; motivo: 'calculada' | 'conhecida' | 'resposta' }
  | { kind: 'desconhecida' };

export interface RegistroLido {
  linha: number;
  dados: Record<string, unknown>;
  extras: Record<string, unknown>;
  evidencia: Record<string, unknown>;
  perguntas: PerguntaCampo[];
  avisos: string[];
}

export function lerRegistro(
  def: EntidadeDef,
  linha: number,
  bruta: Record<string, unknown>,
  destinos: Map<string, Destino>,
  aba: string,
): RegistroLido {
  const dados: Record<string, unknown> = {};
  const extras: Record<string, unknown> = {};
  const evidencia: Record<string, unknown> = {};
  const avisos: string[] = [];

  for (const [header, destino] of destinos) {
    const raw = bruta[header];
    const bruto = valorBruto(raw);
    if (destino.kind === 'ignorar' || destino.kind === 'desconhecida') continue;
    if (bruto === null) continue;
    evidencia[header] = bruto;
    if (destino.kind === 'extra') {
      extras[header] = bruto;
      continue;
    }
    const spec = def.campos[destino.campo];
    if (!spec) continue;
    const lido = lerValor(raw, spec.tipo);
    if (!lido.ok) {
      // Nunca "corrige" o dado: guarda o texto original como informação extra e avisa.
      extras[header] = bruto;
      avisos.push(
        `Linha ${linha}, coluna "${header}": ${lido.motivo} — guardado como informação extra.`,
      );
      continue;
    }
    if (lido.valor !== undefined && dados[destino.campo] === undefined)
      dados[destino.campo] = lido.valor;
  }

  const { perguntas, avisos: avisosDeriv } = def.derivar(dados, extras);
  avisos.push(...avisosDeriv.map((a) => `Linha ${linha}: ${a}`));

  // Campos auxiliares não vão para o banco.
  for (const [k, spec] of Object.entries(def.campos)) if (spec.aux) delete dados[k];
  evidencia.__aba = aba;
  evidencia.__linha = linha;
  return { linha, dados: semVazios(dados), extras, evidencia, perguntas, avisos };
}

/** Diferença entre o que a planilha propõe e o que já está cadastrado (só campos que a planilha preencheu). */
export function diferencas(
  def: EntidadeDef,
  dados: Record<string, unknown>,
  extras: Record<string, unknown>,
  existente: Record<string, unknown>,
): { propostos: Record<string, unknown>; atuais: Record<string, unknown> } | null {
  const propostos: Record<string, unknown> = {};
  const atuais: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(dados)) {
    if (def.campos[campo]?.aux) continue;
    if (!iguais(valor, existente[campo])) {
      propostos[campo] = valor;
      atuais[campo] = existente[campo] ?? null;
    }
  }
  const extrasAtuais = (existente.dados_extras ?? {}) as Record<string, unknown>;
  const extrasNovos = Object.entries(extras).filter(([k, v]) => !iguais(v, extrasAtuais[k]));
  if (extrasNovos.length > 0) {
    propostos.dados_extras = { ...extrasAtuais, ...Object.fromEntries(extrasNovos) };
    atuais.dados_extras = extrasAtuais;
  }
  return Object.keys(propostos).length > 0 ? { propostos, atuais } : null;
}
