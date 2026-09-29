import type { TipoAbaImportacao } from '@rigabras/shared';
import { normTexto } from '../../iaSolicitacoes/leitura.js';

/**
 * Dicionário de colunas da importação inteligente: para cada tipo de aba, os
 * campos que o sistema entende e os nomes de coluna (já normalizados: sem
 * acento, minúsculos, pontuação -> espaço) com que eles aparecem nas planilhas
 * da operação. A ordem dos sinônimos é a preferência: o primeiro é o mais
 * forte. `excluir` descarta cabeçalhos parecidos mas de outro assunto
 * ("tipo de veiculo" não é a placa; "status smp" não é o status da viagem).
 * Coluna que não casar com nada vai para a IA; se nem ela souber, é guardada
 * como informação extra (dados_extras) — nunca é descartada.
 */

export type TipoValor = 'text' | 'plate' | 'number' | 'int' | 'date' | 'datetime' | 'bool';

export interface CampoImport {
  campo: string;
  rotulo: string;
  tipo: TipoValor;
  sinonimos: string[];
  excluir?: string[];
  /** Pode receber várias colunas (textos concatenados). */
  multi?: boolean;
}

const f = (
  campo: string,
  rotulo: string,
  tipo: TipoValor,
  sinonimos: string[],
  extra: Partial<CampoImport> = {},
): CampoImport => ({ campo, rotulo, tipo, sinonimos, ...extra });

export const CAMPOS_POR_TIPO: Record<Exclude<TipoAbaImportacao, 'ignorada'>, CampoImport[]> = {
  viagens: [
    f('codigo_externo', 'ID da viagem', 'text', [
      'id viagem', 'id da viagem', 'codigo viagem', 'codigo da viagem', 'cod viagem',
      'n viagem', 'numero viagem', 'numero da viagem', 'viagem n', 'nro viagem', 'os', 'ordem de servico',
    ], { excluir: ['vigente', 'terceiro'] }),
    f('placa_cavalo', 'Placa do cavalo', 'plate', [
      'placa cavalo', 'placa do cavalo', 'cavalo', 'placa', 'placas', 'placa trator', 'placa veiculo',
      'placa do veiculo', 'placas do veiculo', 'placa tracao', 'veiculo', 'caminhao', 'placa caminhao', 'conjunto',
    ], { excluir: ['carreta', 'reboque', 'tipo', 'vinculo', 'validado', 'vigente', 'semi', 'habitual'] }),
    f('placa_carreta', 'Placa da carreta', 'plate', [
      'placa carreta', 'placa carreta 1', 'placa da carreta', 'carreta', 'carreta 1', 'placa reboque',
      'reboque', 'placa semi reboque', 'semi reboque', 'placa semirreboque', 'semirreboque', 'implemento',
    ], { excluir: ['tipo', '2'] }),
    f('placa_carreta_2', 'Placa da 2ª carreta', 'plate', [
      'placa carreta 2', 'carreta 2', 'placa reboque 2', 'reboque 2', 'segunda carreta',
    ], { excluir: ['tipo'] }),
    f('motorista_codigo', 'Código do motorista', 'text', [
      'id motorista', 'codigo motorista', 'cod motorista', 'matricula motorista', 'id do motorista',
    ], { excluir: ['2'] }),
    f('motorista_nome', 'Motorista', 'text', [
      'nome do motorista', 'motorista', 'nome motorista', 'condutor', 'motorista 1', 'nome condutor',
    ], { excluir: ['id', 'validado', 'operando', '2', 'status', 'perfil', 'cod', 'codigo'] }),
    f('cliente', 'Cliente', 'text', [
      'cliente', 'cliente embarcador', 'embarcador', 'remetente', 'exportador', 'importador',
      'tomador', 'destinatario', 'cliente destino', 'nome cliente',
    ], { excluir: ['id', 'cnpj', 'contato', 'ret', 'retorno', 'volta'] }),
    // Perna de volta (planilhas de frota com "Cliente2 / Origem (Ret) / Destino (Ret)").
    f('cliente_retorno', 'Cliente do retorno', 'text', ['cliente2', 'cliente 2', 'cliente retorno', 'cliente ret', 'cliente volta']),
    f('origem_retorno', 'Origem do retorno', 'text', ['origem ret', 'origem retorno', 'origem volta']),
    f('destino_retorno', 'Destino do retorno', 'text', ['destino ret', 'destino retorno', 'destino volta']),
    f('mercadoria', 'Mercadoria', 'text', [
      'mercadoria', 'produto', 'descricao da mercadoria', 'descricao mercadoria', 'descricao carga',
      'descricao da carga', 'carga', 'material',
    ], { excluir: ['valor', 'tipo', 'categoria', 'peso', 'data', 'hora', 'real', 'faixa', 'acima', 'lmg', 'descarga', 'carregamento'] }),
    f('tipo_mercadoria', 'Tipo de mercadoria', 'text', [
      'tipo de mercadoria', 'tipo mercadoria', 'categoria pgr', 'categoria mercadoria', 'tipo de carga',
      'tipo carga', 'natureza carga', 'natureza da carga', 'categoria',
    ]),
    f('valor_mercadoria', 'Valor da mercadoria', 'number', [
      'valor da carga r', 'valor da carga', 'valor carga', 'valor mercadoria', 'valor da mercadoria',
      'valor nf', 'valor da nf', 'valor nota', 'valor declarado', 'valor',
    ], { excluir: ['frete', 'max', 'perfil', 'averbado', 'faixa', 'minimo'] }),
    f('moeda', 'Moeda', 'text', ['moeda']),
    f('valor_frete', 'Valor do frete', 'number', [
      'valor frete', 'valor do frete', 'frete', 'frete r', 'frete total', 'valor frete r',
    ]),
    f('peso_kg', 'Peso (kg)', 'number', [
      'peso kg', 'peso', 'peso bruto', 'peso bruto kg', 'peso liquido', 'peso carga', 'peso da carga', 'kg',
    ]),
    f('peso_t', 'Peso (t)', 'number', ['peso t', 'peso ton', 'toneladas', 'peso toneladas', 'ton']),
    f('origem', 'Origem', 'text', [
      'origem', 'cidade origem', 'cidade de origem', 'local carregamento', 'local de carregamento',
      'procedencia', 'saida de',
    ], { excluir: ['regra', 'data', 'hora', 'ret', 'retorno', 'volta'] }),
    f('destino', 'Destino', 'text', [
      'destino', 'cidade destino', 'cidade de destino', 'local entrega', 'local de entrega',
      'destino final', 'entrega',
    ], { excluir: ['pais', 'eta', 'chegada', 'espelhado', 'qtde', 'aduana', 'data', 'hora', 'tipo', 'ret', 'retorno', 'volta'] }),
    f('pais_destino', 'País de destino', 'text', ['pais destino', 'pais de destino', 'pais'], {
      excluir: ['transito'],
    }),
    f('numero_crt', 'Nº do CRT', 'text', [
      'crt', 'crt n', 'n crt', 'numero crt', 'numero do crt', 'crt numero', 'nro crt', 'conhecimento',
      'crt danfe', 'crt ou danfe',
    ], { excluir: ['data', 'valor'] }),
    f('numero_danfe', 'Nº da DANFE/NF-e', 'text', [
      'danfe', 'nf', 'nfe', 'nf e', 'nota fiscal', 'n nf', 'numero nf', 'nro nf', 'numero da nota',
      'nota', 'chave nfe',
    ], { excluir: ['valor', 'data'] }),
    f('numero_mic_dta', 'MIC/DTA', 'text', ['mic dta', 'mic dta n', 'mic', 'dta', 'manifesto', 'mic dta numero']),
    f('status_texto', 'Status', 'text', [
      'status', 'status viagem', 'status da viagem', 'situacao', 'situacao viagem', 'etapa',
      'andamento', 'status atual', 'status operacional', 'posicao', 'fase',
    ], { excluir: ['motorista', 'smp', 'geral', 'cod', 'sinal', 'fronteira', 'averb', 'esp', 'checklist', 'oculta', 'rastreador'] }),
    f('localizacao', 'Localização atual', 'text', [
      'localizacao atual', 'localizacao', 'local atual', 'ultima posicao', 'ultima posicao cidade uf pais',
      'posicao atual', 'onde esta', 'local',
    ], { excluir: ['data', 'hora', 'oculta'], multi: true }),
    f('observacoes', 'Observações', 'text', [
      'observacao', 'observacoes', 'obs', 'comentario', 'comentarios', 'observacao para o bot',
      'resumo bot', 'proximo passo', 'ocorrencia', 'historico',
    ], { multi: true, excluir: ['aberta'] }),
    f('data_programacao', 'Data de início / carregamento', 'datetime', [
      'data de carregamento', 'data carregamento', 'data de inicio', 'data inicio', 'inicio previsto',
      'data prevista', 'data programada', 'data programacao', 'previsao carregamento', 'previsao de carregamento',
      'data saida', 'data de saida', 'data abertura', 'data solicitacao', 'data da solicitacao', 'data',
    ], { excluir: ['real', 'chegada', 'validade', 'atualizacao', 'descarga', 'fim', 'final', 'termino', 'emissao', 'vencimento', 'nascimento'] }),
    f('data_coleta', 'Carregamento real', 'datetime', [
      'data hora carregamento real', 'carregamento real', 'data carregamento real', 'data coleta', 'data da coleta',
      'data de coleta', 'coleta',
    ]),
    f('hora_coleta', 'Hora da coleta', 'text', ['hora coleta', 'hora da coleta', 'hora carregamento', 'hora', 'horario'], {
      excluir: ['fim', 'final', 'chegada', 'entrega', 'termino', 'descarga', 'solicitacao'],
    }),
    f('data_inicio_viagem', 'Início real da viagem', 'datetime', ['inicio viagem macro inicio', 'inicio viagem', 'inicio real', 'data inicio real']),
    f('data_entrega', 'Chegada no destino', 'datetime', [
      'data hora chegada destino', 'chegada destino', 'data chegada destino', 'data entrega', 'data de entrega',
      'data fim do transporte', 'data fim transporte', 'fim do transporte', 'data fim', 'data final', 'data termino',
      'data descarga', 'data de descarga',
    ]),
    f('hora_entrega', 'Hora da chegada', 'text', [
      'hora fim do transporte', 'hora fim transporte', 'hora fim', 'hora entrega', 'hora chegada', 'hora descarga',
    ]),
    f('pesquisa_gr', 'Pesquisa GR', 'bool', [
      'motorista validado gr', 'pesquisa', 'pesquisa ok', 'pesquisa gr', 'consulta gr', 'consulta ok',
      'liberacao gr ok', 'gr ok', 'cadastro gr',
    ], { excluir: ['n', 'numero', 'validade', '2'] }),
    f('pesquisa_seguradora', 'Pesquisa seguradora', 'bool', [
      'motorista validado seguradora', 'pesquisa seguradora', 'consulta seguradora', 'seguradora ok',
    ], { excluir: ['n', 'numero', 'validade'] }),
    f('checklist_ok', 'Checklist', 'bool', ['checklist feito', 'checklist ok', 'checklist', 'check list', 'check list ok'], {
      excluir: ['validade', 'data'],
    }),
    f('smp_ok', 'SMP', 'bool', ['smp feita', 'smp ok', 'smp', 'sm ok', 'sm'], {
      excluir: ['n', 'numero', 'status', 'data'],
    }),
    f('carregou', 'Veículo carregou', 'bool', ['veiculo carregou', 'carregou']),
    f('em_viagem', 'Veículo em viagem', 'bool', ['veiculo em viagem', 'em viagem']),
    f('em_fronteira', 'Veículo em fronteira', 'bool', ['veiculo em fronteira', 'em fronteira']),
    f('chegou', 'Veículo chegou', 'bool', ['veiculo chegou', 'chegou']),
    f('descarregou', 'Descarregou', 'bool', ['descarregou', 'descarregado']),
  ],
  veiculos: [
    f('placa', 'Placa', 'plate', ['placa', 'placa veiculo', 'placa do veiculo', 'veiculo', 'placa cavalo'], {
      excluir: ['habitual', 'vinculada'],
    }),
    f('tipo_unidade', 'Tipo de unidade', 'text', ['tipo unidade', 'tipo de unidade', 'unidade']),
    f('tipo_desc', 'Tipo de veículo', 'text', ['tipo de veiculo', 'tipo veiculo', 'tipo', 'categoria', 'especie', 'carroceria']),
    f('marca', 'Marca', 'text', ['marca', 'fabricante', 'montadora']),
    f('modelo', 'Modelo', 'text', ['modelo', 'marca modelo']),
    f('ano_fabricacao', 'Ano', 'int', ['ano', 'ano fabricacao', 'ano de fabricacao', 'ano modelo', 'ano fab']),
    f('capacidade_t', 'Capacidade (t)', 'number', ['capacidade t', 'capacidade ton', 'lotacao t']),
    f('capacidade_kg', 'Capacidade (kg)', 'number', ['capacidade kg', 'capacidade', 'lotacao', 'lotacao kg', 'pbt']),
    f('capacidade_m3', 'Capacidade (m³)', 'number', ['capacidade m3', 'm3', 'cubagem']),
    f('vinculo', 'Vínculo', 'text', ['vinculo', 'vinculo veiculo', 'frota', 'propriedade']),
    f('proprietario', 'Proprietário', 'text', ['proprietario', 'dono', 'arrendatario']),
    f('situacao', 'Situação', 'text', ['situacao', 'status', 'status operacional', 'situacao atual'], {
      excluir: ['consulta', 'rastreador'],
    }),
    f('motorista_atual', 'Motorista atual', 'text', ['motorista atual', 'motorista', 'condutor']),
    f('km_atual', 'Quilometragem', 'number', ['km atual', 'km', 'quilometragem', 'hodometro', 'odometro', 'km rodado']),
    f('nivel_combustivel', 'Combustível (%)', 'number', ['nivel combustivel', 'combustivel', 'tanque', 'nivel de combustivel']),
    f('localizacao_atual', 'Localização', 'text', ['localizacao atual', 'localizacao', 'local atual', 'ultima posicao', 'local']),
    f('ultima_manutencao_data', 'Última manutenção', 'date', ['ultima manutencao', 'data ultima manutencao', 'ultima revisao']),
    f('proxima_manutencao_data', 'Próxima manutenção', 'date', ['proxima manutencao', 'data proxima manutencao', 'proxima revisao']),
    f('rntrc_numero', 'RNTRC', 'text', ['rntrc n', 'rntrc', 'antt']),
    f('rntrc_validade', 'RNTRC validade', 'date', ['rntrc validade', 'validade rntrc']),
    f('crlv_validade', 'CRLV validade', 'date', ['crlv validade', 'validade crlv', 'licenciamento']),
    f('inspecao_tecnica_validade', 'Inspeção técnica', 'date', ['inspecao tecnica validade', 'inspecao tecnica', 'cit validade']),
    f('tacografo_validade', 'Tacógrafo validade', 'date', ['tacografo validade', 'tacografo']),
    f('observacoes_acompanhamento', 'Observações', 'text', ['observacao', 'observacoes', 'obs'], { multi: true }),
  ],
  motoristas: [
    f('codigo_externo', 'Código', 'text', ['id motorista', 'codigo motorista', 'codigo', 'matricula', 'id', 'cod']),
    f('nome_completo', 'Nome', 'text', ['nome completo', 'nome', 'motorista', 'nome do motorista', 'condutor'], {
      excluir: ['empresa', 'mae', 'pai'],
    }),
    f('apelido', 'Apelido', 'text', ['apelido', 'nome de guerra']),
    f('cpf', 'CPF', 'text', ['cpf', 'cpf motorista', 'documento']),
    f('cnh', 'CNH', 'text', ['cnh', 'numero cnh', 'n cnh', 'registro cnh', 'cnh numero'], { excluir: ['categoria', 'validade', 'ear'] }),
    f('cnh_categoria', 'CNH categoria', 'text', ['cnh categoria', 'categoria cnh', 'categoria']),
    f('cnh_validade', 'CNH validade', 'date', ['cnh validade', 'validade cnh', 'vencimento cnh']),
    f('telefone', 'Telefone', 'text', ['telefone', 'celular', 'fone', 'whatsapp', 'contato']),
    f('vinculo', 'Vínculo', 'text', ['vinculo', 'tipo de contrato', 'contrato']),
    f('nacionalidade', 'Nacionalidade', 'text', ['nacionalidade', 'pais']),
    f('data_admissao', 'Admissão', 'date', ['data admissao contrato', 'data admissao', 'admissao']),
    f('toxicologico_vencimento', 'Toxicológico vencimento', 'date', ['toxicologico vencimento', 'vencimento toxicologico']),
    f('mopp_validade', 'MOPP validade', 'date', ['mopp validade']),
    f('doc_viagem_tipo', 'Doc. viagem tipo', 'text', ['doc viagem tipo']),
    f('doc_viagem_validade', 'Doc. viagem validade', 'date', ['doc viagem validade', 'passaporte validade']),
    f('placa_habitual', 'Placa habitual', 'plate', ['placa habitual', 'placa', 'veiculo habitual']),
    f('ativo', 'Ativo', 'bool', ['ativo']),
    f('observacao', 'Observação', 'text', ['observacao', 'observacoes', 'obs'], { multi: true }),
  ],
  clientes: [
    f('codigo_externo', 'Código', 'text', ['id cliente', 'codigo cliente', 'codigo', 'id', 'cod']),
    f('nome', 'Nome', 'text', ['nome', 'cliente', 'razao social', 'nome cliente', 'empresa', 'embarcador']),
    f('documento', 'CNPJ/CUIT', 'text', ['cnpj cuit', 'cnpj', 'cuit', 'cpf cnpj', 'documento', 'rut', 'ruc']),
    f('pais', 'País', 'text', ['pais']),
    f('tipo', 'Tipo', 'text', ['tipo']),
    f('contato', 'Contato', 'text', ['contato corporativo', 'contato', 'telefone', 'email', 'e mail']),
    f('regras', 'Regras', 'text', ['regras especificas', 'regras', 'observacao']),
  ],
  cargas: [
    f('viagem_ref', 'ID da viagem', 'text', ['id viagem', 'viagem', 'codigo viagem', 'n viagem']),
    f('placa', 'Placa', 'plate', ['placa', 'placa cavalo', 'cavalo']),
    f('tipo_documento', 'Tipo de documento', 'text', ['documento', 'tipo documento', 'tipo de documento', 'doc']),
    f('numero_documento', 'Nº do documento', 'text', [
      'n documento', 'numero documento', 'numero do documento', 'crt', 'n crt', 'numero crt', 'danfe',
      'nf', 'nota fiscal', 'numero nf',
    ], { excluir: ['chave', 'valor', 'data'] }),
    f('mercadoria', 'Mercadoria', 'text', ['mercadoria', 'produto', 'descricao']),
    f('tipo_mercadoria', 'Tipo de mercadoria', 'text', ['tipo de mercadoria', 'tipo mercadoria', 'categoria']),
    f('peso_kg', 'Peso (kg)', 'number', ['peso kg', 'peso', 'peso bruto']),
    f('valor_mercadoria', 'Valor', 'number', ['valor r', 'valor averbado', 'valor mercadoria', 'valor nf', 'valor']),
    f('moeda', 'Moeda', 'text', ['moeda']),
  ],
  checklists: [
    f('viagem_ref', 'ID da viagem', 'text', ['id viagem', 'viagem']),
    f('placa', 'Placa', 'plate', ['placa', 'placa cavalo'], { excluir: ['carreta'] }),
    f('resultado', 'Resultado', 'text', ['resultado geral', 'resultado', 'status auto', 'status', 'situacao']),
  ],
  smp: [
    f('viagem_ref', 'ID da viagem', 'text', ['id viagem', 'viagem']),
    f('placa', 'Placa', 'plate', ['placa', 'placa cavalo']),
    f('resultado', 'Status', 'text', ['status', 'situacao', 'status smp']),
  ],
  consultas: [
    f('alvo', 'Alvo (motorista/placa)', 'text', ['id alvo', 'codigo alvo']),
    f('alvo_nome', 'Nome do alvo', 'text', ['nome descricao alvo', 'nome alvo', 'motorista', 'nome']),
    f('placa', 'Placa', 'plate', ['placa vinculada', 'placa']),
    f('viagem_ref', 'ID da viagem', 'text', ['id viagem terceiro', 'id viagem']),
    f('resultado', 'Resultado', 'text', ['resultado', 'status auto', 'status']),
    f('valida', 'Conta como válida', 'bool', ['conta como valida', 'valida']),
  ],
};

/**
 * Colunas que a operação usa mas o sistema não tem campo próprio (faturamento,
 * lote, nº de transporte do cliente — que se repete em várias viagens). Vão
 * direto para as informações extras, sem passar pela IA: assim ela não as
 * confunde com o ID da viagem ou outro campo parecido.
 */
const EXTRAS_CONHECIDOS = [
  /\bfatura\b/, /^lote\b/, /\bemissao\b/, /\bvencimento\b/, /^n transporte$/, /^numero (do )?transporte$/,
  /^transporte$/, /^tipo (de )?veiculo$/,
];
export const ehExtraConhecido = (cabecalho: string) => {
  const n = normTexto(cabecalho);
  return EXTRAS_CONHECIDOS.some((r) => r.test(n));
};

/** Palavras no NOME da aba que indicam o tipo (planilhas costumam nomear bem as abas). */
export const DICAS_NOME_ABA: Array<{ tipo: TipoAbaImportacao; termos: string[] }> = [
  { tipo: 'ignorada', termos: ['leia me', 'leiame', 'painel', 'parametro', 'lista', 'dicionario', 'faq', 'perfil empresa', 'instruc', 'grafico', 'dashboard', 'resumo', 'contato', 'pgr regra', 'apolice', 'sinistro', 'ocorrencia', 'posic', 'espelhamento', 'rastreador', 'ponto'] },
  { tipo: 'viagens', termos: ['viage', 'followup', 'follow up', 'programac', 'embarque', 'carregamento', 'operac', 'acompanhamento viag', 'controle'] },
  { tipo: 'veiculos', termos: ['veicul', 'frota', 'cavalo', 'carreta', 'placas'] },
  { tipo: 'motoristas', termos: ['motorist', 'condutor'] },
  { tipo: 'clientes', termos: ['client', 'embarcador'] },
  { tipo: 'cargas', termos: ['averba', 'crt', 'danfe', 'nota fisca', 'documento', 'carga'] },
  { tipo: 'checklists', termos: ['checklist', 'check list'] },
  { tipo: 'smp', termos: ['smp'] },
  { tipo: 'consultas', termos: ['consulta', 'pesquisa'] },
];

export function dicaPeloNome(aba: string): TipoAbaImportacao | null {
  if (normTexto(aba) === 'fronteira') return 'ignorada';
  const n = ` ${normTexto(aba)} `;
  for (const d of DICAS_NOME_ABA) if (d.termos.some((t) => n.includes(t))) return d.tipo;
  return null;
}

/** Pontuação de um cabeçalho (normalizado) para um campo; 0 = não casa. */
export function pontuar(cabecalho: string, campo: CampoImport): number {
  const h = cabecalho;
  if (!h) return 0;
  // Colunas auxiliares/calculadas ("Dias p/ vencer CNH", "Cód. status (oculta)") nunca são o dado em si.
  if (/oculta/.test(h) || /^(dias|qtd dias|horas) p/.test(h) || h.startsWith('dias para')) return 0;
  const palavras = ` ${h} `;
  if (campo.excluir?.some((x) => palavras.includes(` ${x} `) || (x.length > 3 && h.includes(x))))
    return 0;
  let melhor = 0;
  campo.sinonimos.forEach((s, i) => {
    let p = 0;
    if (h === s) p = 100 - i;
    else if (h.startsWith(`${s} `) || h.endsWith(` ${s}`)) p = 60 - i;
    else if (s.length >= 4 && palavras.includes(` ${s} `)) p = 40 - i;
    if (p > melhor) melhor = p;
  });
  return melhor;
}

export interface Mapeamento {
  /** cabeçalho original -> campo */
  porColuna: Map<string, string>;
  pontos: number;
  /** Campos com coluna atribuída. */
  campos: Set<string>;
}

/**
 * Atribui colunas a campos: cada coluna recebe no máximo um campo e cada
 * campo (exceto os `multi`) no máximo uma coluna, sempre pela maior pontuação.
 */
export function mapearColunas(
  tipo: Exclude<TipoAbaImportacao, 'ignorada'>,
  cabecalhos: string[],
): Mapeamento {
  const campos = CAMPOS_POR_TIPO[tipo];
  const candidatos: Array<{ col: string; campo: CampoImport; p: number }> = [];
  for (const col of cabecalhos) {
    if (tipo === 'viagens' && ehExtraConhecido(col)) continue;
    const n = normTexto(col);
    for (const campo of campos) {
      const p = pontuar(n, campo);
      if (p > 0) candidatos.push({ col, campo, p });
    }
  }
  candidatos.sort((a, b) => b.p - a.p);
  const porColuna = new Map<string, string>();
  const usados = new Set<string>();
  let pontos = 0;
  for (const c of candidatos) {
    if (porColuna.has(c.col)) continue;
    if (usados.has(c.campo.campo) && !c.campo.multi) continue;
    porColuna.set(c.col, c.campo.campo);
    usados.add(c.campo.campo);
    pontos += c.p;
  }
  return { porColuna, pontos, campos: usados };
}

export function campoDef(tipo: Exclude<TipoAbaImportacao, 'ignorada'>, campo: string) {
  return CAMPOS_POR_TIPO[tipo].find((c) => c.campo === campo) ?? null;
}
