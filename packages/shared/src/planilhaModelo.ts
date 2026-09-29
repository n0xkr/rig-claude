/**
 * Planilha modelo para alimentar o sistema pela importação inteligente. Cada
 * aba usa exatamente os nomes de coluna que o dicionário da importação
 * reconhece (há teste na API garantindo isso), então quem preenche o modelo
 * nunca vê coluna "não entendida".
 */
export interface AbaModelo {
  aba: string;
  descricao: string;
  colunas: string[];
  exemplos: Array<Record<string, string | number>>;
}

export const PLANILHA_MODELO: AbaModelo[] = [
  {
    aba: 'Viagens',
    descricao: 'Uma linha por viagem/embarque. Placa do cavalo é obrigatória; o resto é opcional.',
    colunas: [
      'ID da viagem', 'Data de carregamento', 'Placa cavalo', 'Placa carreta', 'Placa carreta 2', 'Motorista',
      'Cliente', 'Mercadoria', 'Tipo de mercadoria', 'Peso (kg)', 'Valor da mercadoria', 'Moeda', 'Valor do frete',
      'Origem', 'Destino', 'País de destino', 'Nº CRT', 'Nota fiscal', 'MIC/DTA', 'Status', 'Localização atual',
      'Pesquisa GR', 'Checklist', 'SMP', 'Observações',
    ],
    exemplos: [
      {
        'ID da viagem': 'V-0001', 'Data de carregamento': '01/10/2026 08:00', 'Placa cavalo': 'ABC1D23',
        'Placa carreta': 'DEF4G56', Motorista: 'JOÃO DA SILVA', Cliente: 'EXEMPLO EXPORTADORA LTDA',
        Mercadoria: 'Peças automotivas', 'Tipo de mercadoria': 'Carga geral', 'Peso (kg)': 24500,
        'Valor da mercadoria': 150000, Moeda: 'USD', 'Valor do frete': 12000, Origem: 'Caxias do Sul/RS',
        Destino: 'Buenos Aires', 'País de destino': 'AR', 'Nº CRT': 'BR.1234.000001', 'Nota fiscal': '123456',
        Status: 'Em trânsito para a fronteira', 'Localização atual': 'BR-290, Alegrete/RS', 'Pesquisa GR': 'Sim',
        Checklist: 'Sim', SMP: 'Sim', Observações: 'Previsão de chegada em Uruguaiana amanhã cedo',
      },
    ],
  },
  {
    aba: 'Motoristas',
    descricao: 'Cadastro de motoristas. Nome completo é obrigatório.',
    colunas: [
      'Nome completo', 'CPF', 'CNH', 'Categoria CNH', 'Validade CNH', 'Telefone', 'Vínculo', 'Nacionalidade',
      'Placa habitual',
    ],
    exemplos: [
      {
        'Nome completo': 'JOÃO DA SILVA', CPF: '000.000.000-00', CNH: '00000000000', 'Categoria CNH': 'E',
        'Validade CNH': '31/12/2028', Telefone: '(55) 99999-0000', Vínculo: 'Frota própria',
        Nacionalidade: 'Brasileira', 'Placa habitual': 'ABC1D23',
      },
    ],
  },
  {
    aba: 'Veiculos',
    descricao: 'Cavalos e carretas. Placa é obrigatória.',
    colunas: [
      'Placa', 'Tipo de veículo', 'Marca', 'Modelo', 'Ano', 'Capacidade (kg)', 'Vínculo', 'Situação', 'KM atual',
      'Validade CRLV',
    ],
    exemplos: [
      {
        Placa: 'ABC1D23', 'Tipo de veículo': 'Cavalo', Marca: 'Scania', Modelo: 'R450', Ano: 2022,
        Vínculo: 'Frota própria', Situação: 'Disponível', 'KM atual': 350000, 'Validade CRLV': '30/09/2027',
      },
      {
        Placa: 'DEF4G56', 'Tipo de veículo': 'Carreta sider', Marca: 'Randon', Ano: 2021, 'Capacidade (kg)': 27000,
        Vínculo: 'Frota própria', Situação: 'Disponível',
      },
    ],
  },
  {
    aba: 'Clientes',
    descricao: 'Clientes/embarcadores. Nome é obrigatório.',
    colunas: ['Nome', 'CNPJ/CUIT', 'País', 'Contato'],
    exemplos: [{ Nome: 'EXEMPLO EXPORTADORA LTDA', 'CNPJ/CUIT': '00.000.000/0001-00', País: 'BR', Contato: 'comercial@exemplo.com' }],
  },
  {
    aba: 'CRT e DANFE',
    descricao: 'Documentos de cada viagem (vários por viagem). Ligue pela coluna ID da viagem ou Placa cavalo.',
    colunas: [
      'ID da viagem', 'Placa cavalo', 'Tipo de documento', 'Número do documento', 'Mercadoria',
      'Tipo de mercadoria', 'Peso (kg)', 'Valor', 'Moeda',
    ],
    exemplos: [
      {
        'ID da viagem': 'V-0001', 'Placa cavalo': 'ABC1D23', 'Tipo de documento': 'CRT',
        'Número do documento': 'BR.1234.000001', Mercadoria: 'Peças automotivas', 'Tipo de mercadoria': 'Carga geral',
        'Peso (kg)': 24500, Valor: 150000, Moeda: 'USD',
      },
      {
        'ID da viagem': 'V-0001', 'Placa cavalo': 'ABC1D23', 'Tipo de documento': 'DANFE',
        'Número do documento': '123456', Mercadoria: 'Peças automotivas', 'Peso (kg)': 24500, Valor: 750000,
        Moeda: 'BRL',
      },
    ],
  },
];

export const PLANILHA_MODELO_INSTRUCOES = [
  'Planilha modelo Rigabras — preencha as abas e importe em "Importar planilhas (IA)".',
  'Apague as linhas de exemplo antes de importar (ou deixe: reimportar não duplica, só atualiza).',
  'Pode deixar colunas vazias e abas inteiras sem preencher. Colunas extras que você adicionar são guardadas como informação extra.',
  'Datas: dd/mm/aaaa ou dd/mm/aaaa hh:mm. Números: 24500 ou 24.500,00. Sim/Não para Pesquisa GR, Checklist e SMP.',
  'Status: texto livre, como na operação ("Na Multilog aguardando liberação", "Liberado em Libres", "No cliente para descarregar", "Finalizado").',
  'Várias placas na mesma célula também funcionam: "ABC1D23/DEF4G56".',
];
