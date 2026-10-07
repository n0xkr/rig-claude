/**
 * Planilha PADRÃO para alimentar o sistema pela importação inteligente. Cada aba traz TODAS as
 * colunas que o sistema sabe gravar (um campo do sistema por coluna) e cada cabeçalho é exatamente
 * um nome que o dicionário da importação reconhece — há teste na API garantindo que toda coluna
 * mapeia para o campo indicado e que nenhum campo do dicionário ficou de fora. Datas e horas
 * podem vir na mesma coluna ("01/10/2026 08:00") ou em colunas separadas (Data X + Hora X).
 */
export type TipoColunaModelo = 'Texto' | 'Número' | 'Data' | 'Data e hora' | 'Hora' | 'Sim/Não' | 'Placa';

export interface ColunaModelo {
  coluna: string;
  /** Campo do sistema que a coluna alimenta (chave do dicionário da importação). */
  campo: string;
  tipo: TipoColunaModelo;
  obrigatoria?: boolean;
  dica: string;
}

export interface AbaModelo {
  aba: string;
  descricao: string;
  colunas: string[];
  detalhes: ColunaModelo[];
  exemplos: Array<Record<string, string | number>>;
}

const c = (
  coluna: string,
  campo: string,
  tipo: TipoColunaModelo,
  dica: string,
  obrigatoria = false,
): ColunaModelo => ({ coluna, campo, tipo, dica, ...(obrigatoria ? { obrigatoria } : {}) });

const aba = (
  nome: string,
  descricao: string,
  detalhes: ColunaModelo[],
  exemplos: AbaModelo['exemplos'],
): AbaModelo => ({ aba: nome, descricao, colunas: detalhes.map((d) => d.coluna), detalhes, exemplos });

const DATA_HORA = 'dd/mm/aaaa hh:mm (ou só dd/mm/aaaa, com a hora na coluna ao lado)';
const HORA = 'hh:mm — junta com a data da coluna ao lado';
const SIM_NAO = 'Sim ou Não';

export const PLANILHA_MODELO: AbaModelo[] = [
  aba(
    'Viagens',
    'Uma linha por viagem/embarque. Só a placa do cavalo é obrigatória; o resto é opcional. Colunas de hora se juntam à data da coluna anterior.',
    [
      c('ID da viagem', 'codigo_externo', 'Texto', 'Código da viagem na sua planilha — é a chave para reimportar sem duplicar'),
      c('Placa cavalo', 'placa_cavalo', 'Placa', 'Placa do cavalo (ABC1D23 ou ABC-1234)', true),
      c('Placa carreta', 'placa_carreta', 'Placa', 'Placa da carreta'),
      c('Placa carreta 2', 'placa_carreta_2', 'Placa', 'Placa da 2ª carreta (bitrem)'),
      c('Código do motorista', 'motorista_codigo', 'Texto', 'Código do motorista, se existir na aba Motoristas'),
      c('Motorista', 'motorista_nome', 'Texto', 'Nome do motorista'),
      c('Cliente', 'cliente', 'Texto', 'Embarcador/cliente (cria o cliente se não existir)'),
      c('Mercadoria', 'mercadoria', 'Texto', 'Descrição da carga'),
      c('Tipo de mercadoria', 'tipo_mercadoria', 'Texto', 'Categoria da carga (ex.: carga geral, aço, químicos)'),
      c('Peso (kg)', 'peso_kg', 'Número', '24500 ou 24.500,00'),
      c('Valor da mercadoria', 'valor_mercadoria', 'Número', 'Valor declarado da carga'),
      c('Moeda', 'moeda', 'Texto', 'BRL, USD, ARS...'),
      c('Valor do frete', 'valor_frete', 'Número', 'Valor do frete'),
      c('Origem', 'origem', 'Texto', 'Cidade/UF de origem'),
      c('Destino', 'destino', 'Texto', 'Cidade/UF de destino'),
      c('País de destino', 'pais_destino', 'Texto', 'Sigla ou nome (AR, Argentina...); se vazio, deduzido do destino'),
      c('Nº CRT', 'numero_crt', 'Texto', 'Um ou vários separados por ; ou /'),
      c('Nota fiscal', 'numero_danfe', 'Texto', 'Número(s) da DANFE/NF-e'),
      c('MIC/DTA', 'numero_mic_dta', 'Texto', 'Número do MIC/DTA'),
      c('Status', 'status_texto', 'Texto', 'Texto livre da operação ("Liberado em Libres", "Finalizado"): o sistema traduz para a etapa'),
      c('Localização atual', 'localizacao', 'Texto', 'Onde o veículo está agora'),
      c('Data de carregamento', 'data_programacao', 'Data e hora', `Início/carregamento previsto — ${DATA_HORA}`),
      c('Hora prevista carregamento', 'hora_programacao', 'Hora', HORA),
      c('Data da ordem de coleta', 'data_ordem_coleta', 'Data e hora', DATA_HORA),
      c('Hora da ordem de coleta', 'hora_ordem_coleta', 'Hora', HORA),
      c('Data coleta', 'data_coleta', 'Data e hora', `Carregamento real — ${DATA_HORA}`),
      c('Hora coleta', 'hora_coleta', 'Hora', HORA),
      c('Data inicio viagem', 'data_inicio_viagem', 'Data e hora', `Saída real — ${DATA_HORA}`),
      c('Hora inicio viagem', 'hora_inicio_viagem', 'Hora', HORA),
      c('Data chegada fronteira', 'data_chegada_fronteira', 'Data e hora', DATA_HORA),
      c('Hora chegada fronteira', 'hora_chegada_fronteira', 'Hora', HORA),
      c('Data liberacao fronteira', 'data_liberacao_fronteira', 'Data e hora', DATA_HORA),
      c('Hora liberacao fronteira', 'hora_liberacao_fronteira', 'Hora', HORA),
      c('Data entrega', 'data_entrega', 'Data e hora', `Chegada no destino — ${DATA_HORA}`),
      c('Hora entrega', 'hora_entrega', 'Hora', HORA),
      c('Data encerramento', 'data_encerramento', 'Data e hora', `Fechamento da viagem — ${DATA_HORA}`),
      c('Hora encerramento', 'hora_encerramento', 'Hora', HORA),
      c('Pesquisa GR', 'pesquisa_gr', 'Sim/Não', `Motorista/veículo pesquisados na gerenciadora — ${SIM_NAO}`),
      c('Pesquisa seguradora', 'pesquisa_seguradora', 'Sim/Não', SIM_NAO),
      c('Checklist', 'checklist_ok', 'Sim/Não', SIM_NAO),
      c('SMP', 'smp_ok', 'Sim/Não', SIM_NAO),
      c('KM rodado', 'km_rodado', 'Número', 'KM percorridos na viagem'),
      c('KM vazio', 'km_vazio', 'Número', 'KM rodados vazio'),
      c('Consumo combustivel litros', 'consumo_combustivel_litros', 'Número', 'Litros consumidos'),
      c('Destino armazem Rigabras', 'destino_armazem_rigabras', 'Sim/Não', `A carga vai para o armazém da Rigabras — ${SIM_NAO}`),
      c('Observações', 'observacoes', 'Texto', 'Qualquer observação da operação'),
    ],
    [
      {
        'ID da viagem': 'V-0001', 'Placa cavalo': 'ABC1D23', 'Placa carreta': 'DEF4G56', 'Código do motorista': 'MOT-001',
        Motorista: 'JOÃO DA SILVA', Cliente: 'EXEMPLO EXPORTADORA LTDA', Mercadoria: 'Peças automotivas',
        'Tipo de mercadoria': 'Carga geral', 'Peso (kg)': 24500, 'Valor da mercadoria': 150000, Moeda: 'USD',
        'Valor do frete': 12000, Origem: 'Caxias do Sul/RS', Destino: 'Buenos Aires', 'País de destino': 'AR',
        'Nº CRT': 'BR.1234.000001', 'Nota fiscal': '123456', 'MIC/DTA': '26BR000123', Status: 'Em trânsito para a fronteira',
        'Localização atual': 'BR-290, Alegrete/RS', 'Data de carregamento': '01/10/2026', 'Hora prevista carregamento': '08:00',
        'Data da ordem de coleta': '30/09/2026', 'Hora da ordem de coleta': '16:30', 'Data coleta': '01/10/2026',
        'Hora coleta': '09:15', 'Data inicio viagem': '01/10/2026', 'Hora inicio viagem': '11:40',
        'Data chegada fronteira': '02/10/2026', 'Hora chegada fronteira': '07:20', 'Data liberacao fronteira': '02/10/2026',
        'Hora liberacao fronteira': '15:05', 'Data entrega': '03/10/2026', 'Hora entrega': '10:30',
        'Data encerramento': '03/10/2026', 'Hora encerramento': '18:00', 'Pesquisa GR': 'Sim', 'Pesquisa seguradora': 'Sim',
        Checklist: 'Sim', SMP: 'Sim', 'KM rodado': 1450, 'KM vazio': 120, 'Consumo combustivel litros': 520,
        'Destino armazem Rigabras': 'Não', Observações: 'Previsão de chegada em Uruguaiana amanhã cedo',
      },
    ],
  ),
  aba(
    'Motoristas',
    'Cadastro de motoristas. Nome completo é obrigatório.',
    [
      c('Código do motorista', 'codigo_externo', 'Texto', 'Código/matrícula — liga o motorista às viagens'),
      c('Nome completo', 'nome_completo', 'Texto', 'Nome do motorista', true),
      c('Apelido', 'apelido', 'Texto', 'Nome de guerra'),
      c('CPF', 'cpf', 'Texto', '000.000.000-00'),
      c('RG', 'rg', 'Texto', 'Número do RG'),
      c('Data de nascimento', 'data_nascimento', 'Data', 'dd/mm/aaaa'),
      c('Nome da mãe', 'nome_mae', 'Texto', 'Filiação'),
      c('Nome do pai', 'nome_pai', 'Texto', 'Filiação'),
      c('Telefone', 'telefone', 'Texto', 'Celular com DDD'),
      c('Nacionalidade', 'nacionalidade', 'Texto', 'Ex.: Brasileira'),
      c('Vínculo', 'vinculo', 'Texto', '"Frota própria" ou agregado/terceiro'),
      c('Data admissão', 'data_admissao', 'Data', 'dd/mm/aaaa'),
      c('CNH', 'cnh', 'Texto', 'Número da CNH'),
      c('Categoria CNH', 'cnh_categoria', 'Texto', 'C, D ou E'),
      c('Validade CNH', 'cnh_validade', 'Data', 'dd/mm/aaaa'),
      c('Primeira habilitação', 'cnh_primeira_habilitacao', 'Data', 'dd/mm/aaaa'),
      c('CNH com EAR', 'cnh_ear', 'Sim/Não', `Exerce atividade remunerada — ${SIM_NAO}`),
      c('Toxicológico data', 'toxicologico_data', 'Data', 'Data do último exame'),
      c('Toxicológico vencimento', 'toxicologico_vencimento', 'Data', 'dd/mm/aaaa'),
      c('MOPP', 'mopp_texto', 'Texto', '"Possui - 18/07/2026", "Não possui" ou "Vencido"'),
      c('MOPP validade', 'mopp_validade', 'Data', 'dd/mm/aaaa'),
      c('Doc viagem tipo', 'doc_viagem_tipo', 'Texto', 'Passaporte, RG Mercosul...'),
      c('Doc viagem validade', 'doc_viagem_validade', 'Data', 'dd/mm/aaaa'),
      c('Treinamento PGR', 'treinamento_pgr_data', 'Data', 'Data do treinamento de PGR'),
      c('Placa habitual', 'placa_habitual', 'Placa', 'Cavalo que o motorista costuma dirigir'),
      c('Ativo', 'ativo', 'Sim/Não', SIM_NAO),
      c('Observação', 'observacao', 'Texto', 'Livre'),
    ],
    [
      {
        'Código do motorista': 'MOT-001', 'Nome completo': 'JOÃO DA SILVA', Apelido: 'JOÃO', CPF: '000.000.000-00', RG: '1234567890',
        'Data de nascimento': '15/03/1985', 'Nome da mãe': 'MARIA DA SILVA', 'Nome do pai': 'JOSÉ DA SILVA', Telefone: '(55) 99999-0000',
        Nacionalidade: 'Brasileira', Vínculo: 'Frota própria', 'Data admissão': '10/01/2020', CNH: '00000000000',
        'Categoria CNH': 'E', 'Validade CNH': '31/12/2028', 'Primeira habilitação': '20/06/2004', 'CNH com EAR': 'Sim',
        'Toxicológico data': '10/05/2026', 'Toxicológico vencimento': '10/05/2027', MOPP: 'Possui - 18/07/2027',
        'MOPP validade': '18/07/2027', 'Doc viagem tipo': 'Passaporte', 'Doc viagem validade': '01/02/2030',
        'Treinamento PGR': '15/02/2026', 'Placa habitual': 'ABC1D23', Ativo: 'Sim', Observação: 'Habilitado para fronteira',
      },
    ],
  ),
  aba(
    'Veiculos',
    'Cavalos e carretas. Placa é obrigatória.',
    [
      c('Placa', 'placa', 'Placa', 'Placa do veículo', true),
      c('Tipo de unidade', 'tipo_unidade', 'Texto', 'Cavalo ou Carreta'),
      c('Tipo de veículo', 'tipo_desc', 'Texto', 'Ex.: Carreta sider, Carreta aberta, Cavalo 6x2'),
      c('Marca', 'marca', 'Texto', 'Ex.: Scania'),
      c('Modelo', 'modelo', 'Texto', 'Ex.: R450'),
      c('Ano', 'ano_fabricacao', 'Número', 'Ano de fabricação'),
      c('Capacidade (kg)', 'capacidade_kg', 'Número', 'Capacidade de carga'),
      c('Capacidade m3', 'capacidade_m3', 'Número', 'Cubagem'),
      c('Vínculo', 'vinculo', 'Texto', '"Frota própria" ou terceiro/agregado'),
      c('Proprietário', 'proprietario', 'Texto', 'Dono do veículo'),
      c('Situação', 'situacao', 'Texto', 'Disponível, Em viagem, Manutenção, Garagem...'),
      c('Motorista atual', 'motorista_atual', 'Texto', 'Quem está com o veículo'),
      c('KM atual', 'km_atual', 'Número', 'Hodômetro'),
      c('Nível de combustível', 'nivel_combustivel', 'Número', '0 a 100 (%)'),
      c('Localização atual', 'localizacao_atual', 'Texto', 'Onde está agora'),
      c('Última manutenção', 'ultima_manutencao_data', 'Data', 'dd/mm/aaaa'),
      c('Próxima manutenção', 'proxima_manutencao_data', 'Data', 'dd/mm/aaaa'),
      c('RNTRC', 'rntrc_numero', 'Texto', 'Número do RNTRC (ANTT)'),
      c('RNTRC validade', 'rntrc_validade', 'Data', 'dd/mm/aaaa'),
      c('Validade CRLV', 'crlv_validade', 'Data', 'dd/mm/aaaa'),
      c('Inspeção técnica validade', 'inspecao_tecnica_validade', 'Data', 'dd/mm/aaaa'),
      c('Tacógrafo validade', 'tacografo_validade', 'Data', 'dd/mm/aaaa'),
      c('ID rastreador', 'rastreador_autotrac_id', 'Texto', 'Código do rastreador (Autotrac)'),
      c('Ativo', 'ativo', 'Sim/Não', SIM_NAO),
      c('Observações', 'observacoes_acompanhamento', 'Texto', 'Livre'),
    ],
    [
      {
        Placa: 'ABC1D23', 'Tipo de unidade': 'Cavalo', 'Tipo de veículo': 'Cavalo 6x2', Marca: 'Scania', Modelo: 'R450', Ano: 2022,
        'Capacidade (kg)': 45000, Vínculo: 'Frota própria', Proprietário: 'RIGABRAS TRANSPORTES', Situação: 'Disponível',
        'Motorista atual': 'JOÃO DA SILVA', 'KM atual': 350000, 'Nível de combustível': 80, 'Localização atual': 'Pátio Uruguaiana/RS',
        'Última manutenção': '01/08/2026', 'Próxima manutenção': '01/11/2026', RNTRC: '012345678', 'RNTRC validade': '30/06/2027',
        'Validade CRLV': '30/09/2027', 'Inspeção técnica validade': '15/03/2027', 'Tacógrafo validade': '20/05/2027',
        'ID rastreador': 'AT-12345', Ativo: 'Sim', Observações: 'Revisão em dia',
      },
      {
        Placa: 'DEF4G56', 'Tipo de unidade': 'Carreta', 'Tipo de veículo': 'Carreta sider', Marca: 'Randon', Ano: 2021,
        'Capacidade (kg)': 27000, 'Capacidade m3': 90, Vínculo: 'Frota própria', Situação: 'Disponível', Ativo: 'Sim',
      },
    ],
  ),
  aba(
    'Clientes',
    'Clientes/embarcadores. Nome é obrigatório.',
    [
      c('Código do cliente', 'codigo_externo', 'Texto', 'Código do cliente na sua planilha'),
      c('Nome', 'nome', 'Texto', 'Razão social', true),
      c('CNPJ/CUIT', 'documento', 'Texto', 'CNPJ (BR), CUIT (AR), RUT, RUC'),
      c('País', 'pais', 'Texto', 'Sigla ou nome'),
      c('Tipo', 'tipo', 'Texto', 'Ex.: Exportador, Importador'),
      c('Contato', 'contato', 'Texto', 'E-mail ou telefone'),
      c('Regras', 'regras', 'Texto', 'Regras específicas de embarque do cliente'),
      c('Exige GR propria', 'exige_gr_propria', 'Sim/Não', SIM_NAO),
      c('GR do cliente', 'gr_cliente', 'Texto', 'Gerenciadora de risco do cliente'),
      c('Exige espelhamento', 'exige_espelhamento', 'Sim/Não', SIM_NAO),
      c('PGR proprio', 'pgr_proprio', 'Sim/Não', SIM_NAO),
      c('DDR', 'ddr', 'Sim/Não', SIM_NAO),
    ],
    [
      {
        'Código do cliente': 'CLI-001', Nome: 'EXEMPLO EXPORTADORA LTDA', 'CNPJ/CUIT': '00.000.000/0001-00', País: 'BR',
        Tipo: 'Exportador', Contato: 'comercial@exemplo.com', Regras: 'Carregar apenas pela manhã', 'Exige GR propria': 'Não',
        'GR do cliente': 'Gerenciadora X', 'Exige espelhamento': 'Sim', 'PGR proprio': 'Não', DDR: 'Não',
      },
    ],
  ),
  aba(
    'CRT e DANFE',
    'Documentos de cada viagem (vários por viagem). Ligue pela coluna ID da viagem ou Placa cavalo.',
    [
      c('ID da viagem', 'viagem_ref', 'Texto', 'Mesmo ID da aba Viagens'),
      c('Placa cavalo', 'placa', 'Placa', 'Use se não houver ID da viagem'),
      c('Tipo de documento', 'tipo_documento', 'Texto', 'CRT, DANFE ou outro'),
      c('Número do documento', 'numero_documento', 'Texto', 'Número do CRT/DANFE', true),
      c('Mercadoria', 'mercadoria', 'Texto', 'Descrição'),
      c('Tipo de mercadoria', 'tipo_mercadoria', 'Texto', 'Categoria'),
      c('Peso (kg)', 'peso_kg', 'Número', 'Peso do documento'),
      c('Valor', 'valor_mercadoria', 'Número', 'Valor do documento'),
      c('Moeda', 'moeda', 'Texto', 'BRL, USD...'),
    ],
    [
      {
        'ID da viagem': 'V-0001', 'Placa cavalo': 'ABC1D23', 'Tipo de documento': 'CRT', 'Número do documento': 'BR.1234.000001',
        Mercadoria: 'Peças automotivas', 'Tipo de mercadoria': 'Carga geral', 'Peso (kg)': 24500, Valor: 150000, Moeda: 'USD',
      },
      {
        'ID da viagem': 'V-0001', 'Placa cavalo': 'ABC1D23', 'Tipo de documento': 'DANFE', 'Número do documento': '123456',
        Mercadoria: 'Peças automotivas', 'Peso (kg)': 24500, Valor: 750000, Moeda: 'BRL',
      },
    ],
  ),
  aba(
    'Checklists',
    'Resultado do checklist de cada viagem/veículo (alimenta a marca "Checklist" da viagem).',
    [
      c('ID da viagem', 'viagem_ref', 'Texto', 'Mesmo ID da aba Viagens'),
      c('Placa cavalo', 'placa', 'Placa', 'Use se não houver ID da viagem'),
      c('Resultado geral', 'resultado', 'Texto', 'Aprovado, Reprovado, Pendente...', true),
    ],
    [{ 'ID da viagem': 'V-0001', 'Placa cavalo': 'ABC1D23', 'Resultado geral': 'Aprovado' }],
  ),
  aba(
    'SMP',
    'Situação da SMP (Solicitação de Monitoramento e Proteção) de cada viagem.',
    [
      c('ID da viagem', 'viagem_ref', 'Texto', 'Mesmo ID da aba Viagens'),
      c('Placa cavalo', 'placa', 'Placa', 'Use se não houver ID da viagem'),
      c('Status SMP', 'resultado', 'Texto', 'Liberada, Em andamento, Recusada...', true),
    ],
    [{ 'ID da viagem': 'V-0001', 'Placa cavalo': 'ABC1D23', 'Status SMP': 'Em andamento' }],
  ),
  aba(
    'Consultas GR',
    'Pesquisas/consultas de motorista e veículo na gerenciadora (alimentam "Pesquisa GR" da viagem).',
    [
      c('ID alvo', 'alvo', 'Texto', 'Código do motorista consultado'),
      c('Nome alvo', 'alvo_nome', 'Texto', 'Nome do motorista/alvo consultado'),
      c('Placa vinculada', 'placa', 'Placa', 'Placa consultada'),
      c('ID viagem', 'viagem_ref', 'Texto', 'Viagem a que a consulta se refere'),
      c('Resultado', 'resultado', 'Texto', 'Adequado, Inadequado, Em análise...', true),
      c('Conta como valida', 'valida', 'Sim/Não', SIM_NAO),
    ],
    [{ 'ID alvo': 'MOT-001', 'Nome alvo': 'JOÃO DA SILVA', 'Placa vinculada': 'ABC1D23', 'ID viagem': 'V-0001', Resultado: 'Adequado', 'Conta como valida': 'Sim' }],
  ),
];

export const PLANILHA_MODELO_INSTRUCOES = [
  'Planilha padrão Rigabras — preencha as abas e importe em "Importar dados".',
  'Ela traz todas as colunas que o sistema sabe gravar. Pode deixar colunas vazias e abas inteiras sem preencher; só a placa (viagens/veículos) e o nome (motoristas/clientes) são obrigatórios.',
  'Colunas novas que você acrescentar são criadas como campos do sistema automaticamente (texto, número, data, hora ou sim/não, conforme o conteúdo) e ficam guardadas em "Campos adicionais" de cada registro.',
  'Datas: dd/mm/aaaa ou dd/mm/aaaa hh:mm. Horas: hh:mm (pode ser numa coluna separada "Hora ..." ao lado da data). Números: 24500 ou 24.500,00. Sim/Não para as marcações.',
  'Status: texto livre, como na operação ("Na Multilog aguardando liberação", "Liberado em Libres", "No cliente para descarregar", "Finalizado").',
  'Várias placas na mesma célula também funcionam: "ABC1D23/DEF4G56".',
  'Apague as linhas de exemplo antes de importar (ou deixe: reimportar não duplica, só atualiza).',
];
