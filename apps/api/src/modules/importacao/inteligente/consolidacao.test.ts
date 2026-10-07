import { describe, expect, it } from 'vitest';
import { PLANILHA_MODELO, statusViagemDeTexto } from '@rigabras/shared';
import { classificarAba, lerRegistros, type AbaLida, type TipoDados } from './interpretacao.js';
import { consolidar, paisDe, type BaseExistente } from './consolidacao.js';
import { CAMPOS_POR_TIPO } from './dicionario.js';

function ler(nome: string, cabecalhos: string[], linhas: Array<Record<string, unknown>>): AbaLida {
  const aba = { nome, cabecalhos, linhas };
  const c = classificarAba(aba);
  const tipo = c?.tipo ?? 'ignorada';
  return {
    tipo,
    registros: tipo === 'ignorada' ? [] : lerRegistros('t.xlsx', aba, tipo as TipoDados, c!.mapa!.porColuna),
    info: { arquivo: 't.xlsx', aba: nome, tipo, origemTipo: 'dicionario', linhas: linhas.length, colunas: [] },
  };
}

const vazia = (): BaseExistente => ({
  veiculos: [],
  motoristas: [],
  clientes: [],
  viagens: [],
  cargasPorViagem: new Map(),
});

describe('importação inteligente', () => {
  it('deduz a etapa da viagem a partir de texto livre', () => {
    expect(statusViagemDeTexto('VEICULO NA MULTILOG AGUARD. LIBERAÇÃO')).toBe('ENTRADA_ADUANA_MULTILOG');
    expect(statusViagemDeTexto('VEICULO LIBERADO EM LIBRES')).toBe('SAIDA_ADUANA_COTECAR');
    expect(statusViagemDeTexto('VEICULO NO CLIENTE PRA DESCARREGAR')).toBe('CHEGADA_CLIENTE');
    expect(statusViagemDeTexto('Aguardando pedido de cruze')).toBe('NA_FRONTEIRA_AGUARDANDO_CRUZE');
    expect(statusViagemDeTexto('20 Finalizado')).toBe('ENCERRADA');
    expect(statusViagemDeTexto('xyz')).toBeNull();
  });

  it('reconhece a planilha de controle de transportes (Sheet1 com "Placas" do conjunto)', () => {
    const cab = [
      'Tipo de Veiculo', 'Data Solicitação', 'Data Coleta', 'Hora', 'Motorista', 'Placas', 'Status',
      'Fatura Rigabras', 'Fatura Exportação', 'Lote', 'Emissão Fatura Rigabras', 'Vencimento Fatura Rigabras',
      'Peso Bruto', 'Nº transporte', 'Nº CRT', 'Origem', 'Destino', 'Data Fim do Transporte',
      'Hora Fim do transporte', 'Observações adicionais',
    ];
    const linha = (crt: string, placas: string) => ({
      'Tipo de Veiculo': 'RODOTREM', 'Data Solicitação': '2024-05-10', 'Data Coleta': '2024-05-13', Hora: '09:00',
      Motorista: 'MARCELO SILVA', Placas: placas, Status: 'ENTREGUE', 'Fatura Rigabras': '20659/24',
      'Peso Bruto': '10.781,00', 'Nº transporte': '13119132', 'Nº CRT': crt, Origem: 'ITAJAI/SC',
      Destino: 'BUENOS AIRES', 'Data Fim do Transporte': '2024-05-22', 'Hora Fim do transporte': '20:36',
    });
    const aba = ler('Sheet1', cab, [linha('BR.2715.100001', 'MLM1E90/MLM2F11'), linha('BR.2715.100002', 'MLM1E90/MLM2F11')]);
    expect(aba.tipo).toBe('viagens');
    const r = aba.registros[0]!.campos;
    expect(r.placa_cavalo).toBe('MLM1E90');
    expect(r.placa_carreta).toBe('MLM2F11');
    expect(r.numero_crt).toBe('BR.2715.100001');
    expect(r.codigo_externo).toBeUndefined();
    expect(r.data_coleta).toBe('2024-05-13T12:00:00.000Z');
    expect(r.data_entrega).toBe('2024-05-22T23:36:00.000Z');
    expect(aba.registros[0]!.extras['Nº transporte']).toBe('13119132');
    const plano = consolidar([aba], vazia(), new Map());
    // Mesmo cavalo, mesmo dia de coleta: uma viagem (rodotrem) com os dois CRTs.
    expect(plano.viagens).toHaveLength(1);
    expect(plano.viagens[0]!.cargas.map((x) => x.numero_documento)).toEqual(['BR.2715.100001', 'BR.2715.100002']);
    expect(plano.viagens[0]!.dados.peso_kg).toBe(21562);
    expect(plano.viagens[0]!.dados.status).toBe('ENCERRADA');
  });

  it('VEGA: lotes do mesmo CRT somam peso, linha duplicada é ignorada, data com mês por extenso', () => {
    const cab = ['Data Coleta', 'Motorista', 'Placas', 'Status', 'Lote', 'Peso Bruto', 'Nº CRT', 'Origem', 'Destino', 'Data Fim do Transporte', 'Hora Fim do transporte', 'Observações adicionais'];
    const l = (lote: string, peso: string, crt: string, fim: string, placas = 'MLM1E90/MMA9I46/MMA9I96') => ({
      'Data Coleta': '10/05/2024', Motorista: 'MARCELO MACHADO', Placas: placas, Status: 'ENTREGUE', Lote: lote,
      'Peso Bruto': peso, 'Nº CRT': crt, Origem: 'ITAJAÍ/SC', Destino: 'BUENOS AIRES/AR',
      'Data Fim do Transporte': fim, 'Hora Fim do transporte': '20:36:00', 'Observações adicionais': 'GONVARRI',
    });
    const linhas = [
      l('A1', ' 10.781,00 ', 'BR.1', '22.mai.2024'),
      l('A2', ' 13.602,00 ', 'BR.1', '22.mai.2024'),
      l('A2', ' 13.602,00 ', 'BR.1', '22.mai.2024'), // duplicada
      l('B1', ' 13.783,00 ', 'BR.2', '21.Mai.2024'),
    ];
    const aba = ler('Sheet1', cab, linhas);
    expect(aba.registros[0]!.campos.data_entrega).toBe('2024-05-22T23:36:00.000Z');
    expect(aba.registros[0]!.campos.placa_carreta_2).toBe('MMA9I96');
    const plano = consolidar([aba], vazia(), new Map());
    expect(plano.viagens).toHaveLength(1);
    const v = plano.viagens[0]!;
    expect(v.cargas.find((x) => x.numero_documento === 'BR.1')!.peso_kg).toBe(24383);
    expect(v.dados.peso_kg).toBe(38166);
    expect((v.dados.dados_extras as Record<string, unknown>).Lote).toBe('A1 | A2 | B1');
    expect(plano.avisos.some((a) => a.includes('1 linha(s) idêntica'))).toBe(true);

    // Reimportar a mesma planilha não muda nada (os lotes não somam de novo sobre o banco).
    const gravada = { id: 'v1', ...v.dados, motorista_id: null };
    const base: BaseExistente = { ...vazia(), viagens: [gravada], cargasPorViagem: new Map([['v1', v.cargas]]) };
    const de_novo = consolidar([ler('Sheet1', cab, linhas)], base, new Map());
    expect(de_novo.viagens).toHaveLength(1);
    expect(de_novo.viagens[0]!.cargas.find((x) => x.numero_documento === 'BR.2')!.peso_kg).toBe(13783);
    expect(de_novo.viagens[0]!.cargasMudaram).toBe(false);
    expect(de_novo.viagens[0]!.dados.peso_kg).toBeUndefined();
  });

  it('placas coladas e retrato da frota (manutenção/pátio/retorno) não viram viagem falsa', () => {
    const cab = ['Placa Cavalo', 'Placa Carreta', 'Motorista', 'Cliente', 'Origem (Ida)', 'Destino (Ida)', 'Cliente2', 'Origem (Ret)', 'Destino (Ret)', 'STATUS', 'Observações'];
    const aba = ler('Sheet1', cab, [
      { 'Placa Cavalo': 'JDE5H04', Cliente: 'DIGITAL DIESEL', 'Destino (Ida)': 'TRES CACHOEIRAS RS', STATUS: 'SEM MOTORISTA', Observações: 'VEICULO EM MANUTENÇÃO' },
      { 'Placa Cavalo': 'JDE5H06', 'Placa Carreta': 'DTD8C27', Motorista: 'ISMAR', Cliente: 'RETORNOU VAZIO DA GONVARRI', STATUS: 'PATIO RIGABRAS', Observações: 'VEICULO VAZIO NO PATIO RIGABRAS' },
      { 'Placa Cavalo': 'JDE5H01', 'Placa Carreta': 'JDO1E73', Motorista: 'JUAREZ PAHIM', Cliente: 'RETORNANDO VAZIO DA BALL PY', STATUS: 'RET.VAZIO', Observações: 'VEICULO EM TRANSITO RET. URUGUAIANA' },
      { 'Placa Cavalo': 'JCR9G17', 'Placa Carreta': 'JDO5J15', Motorista: 'CARLOS DUTRA', Cliente2: 'TRANSWEIDE', 'Origem (Ret)': 'SANTIAGO CL', 'Destino (Ret)': 'URUGUAIANA', STATUS: 'RET.CARREGADO', Observações: 'VEICULO EM TRANSITO RET. URUGUAIANA' },
      { 'Placa Cavalo': 'JDE5H03', 'Placa Carreta': 'DTD9J28', Motorista: 'JONAS EDUARDO', Cliente: 'GONVARRI', 'Origem (Ida)': 'URUGUAIANA', 'Destino (Ida)': 'BUENOS AIRES', STATUS: 'RAMÃO VARGAS', Observações: 'VEICULO LIBERADO EM LIBRES' },
    ]);
    expect(aba.tipo).toBe('viagens');
    const plano = consolidar([aba], vazia(), new Map());
    const por = Object.fromEntries(plano.viagens.map((v) => [v.previa.placa_cavalo, v.previa]));
    expect(Object.keys(por).sort()).toEqual(['JCR9G17', 'JDE5H01', 'JDE5H03']);
    expect(por.JDE5H01!.status).toBe('RETORNANDO_VAZIO');
    expect(por.JDE5H01!.cliente).toBe('BALL PY');
    expect(por.JCR9G17).toMatchObject({ status: 'EM_TRANSITO_FRONTEIRA', cliente: 'TRANSWEIDE', origem: 'SANTIAGO CL', destino: 'URUGUAIANA' });
    expect(por.JDE5H03!.status).toBe('SAIDA_ADUANA_COTECAR');
    const veic = Object.fromEntries(plano.veiculos.map((v) => [v.ref, v.dados]));
    expect(veic.JDE5H04!.status_operacional).toBe('MANUTENCAO');
    expect(veic.JDE5H06!.status_operacional).toBe('DISPONIVEL');
    expect(plano.clientes.map((c) => c.dados.nome)).not.toContain('DIGITAL DIESEL');
  });

  it('planilha padrão: toda aba é reconhecida, cada coluna cai no campo certo e nenhum campo do sistema ficou de fora', () => {
    const esperado: Record<string, string> = {
      Viagens: 'viagens',
      Motoristas: 'motoristas',
      Veiculos: 'veiculos',
      Clientes: 'clientes',
      'CRT e DANFE': 'cargas',
      Checklists: 'checklists',
      SMP: 'smp',
      'Consultas GR': 'consultas',
    };
    for (const m of PLANILHA_MODELO) {
      const c = classificarAba({ nome: m.aba, cabecalhos: m.colunas, linhas: m.exemplos });
      expect(c?.tipo, m.aba).toBe(esperado[m.aba]);
      const semCampo = m.colunas.filter((col) => !c!.mapa!.porColuna.has(col));
      expect(semCampo, m.aba).toEqual([]);
      // Cada coluna alimenta exatamente o campo que o modelo diz.
      const trocados = m.detalhes.filter((d) => c!.mapa!.porColuna.get(d.coluna) !== d.campo).map((d) => `${d.coluna} → ${c!.mapa!.porColuna.get(d.coluna)} (esperado ${d.campo})`);
      expect(trocados, m.aba).toEqual([]);
      // Nenhum campo do dicionário fica sem coluna na planilha (exceto alternativas/atalhos).
      const dispensados = new Set(['peso_t', 'capacidade_t', 'cliente_retorno', 'origem_retorno', 'destino_retorno', 'carregou', 'em_viagem', 'em_fronteira', 'chegou', 'descarregou']);
      const faltando = CAMPOS_POR_TIPO[esperado[m.aba] as keyof typeof CAMPOS_POR_TIPO]
        .map((x) => x.campo)
        .filter((campo) => !dispensados.has(campo) && !m.detalhes.some((d) => d.campo === campo));
      expect(faltando, m.aba).toEqual([]);
    }
    const viagens = PLANILHA_MODELO[0]!;
    const r = ler(viagens.aba, viagens.colunas, viagens.exemplos).registros[0]!;
    expect(Object.keys(r.extras)).toEqual([]);
    expect(r.campos.pesquisa_gr).toBe(true);
    expect(r.campos.peso_kg).toBe(24500);
    // Horários: cada "Hora ..." se junta à data ao lado (horário de Brasília -03:00 → ISO em UTC).
    expect(r.campos.data_programacao).toBe('2026-10-01T11:00:00.000Z');
    expect(r.campos.data_ordem_coleta).toBe('2026-09-30T19:30:00.000Z');
    expect(r.campos.data_coleta).toBe('2026-10-01T12:15:00.000Z');
    expect(r.campos.data_chegada_fronteira).toBe('2026-10-02T10:20:00.000Z');
    expect(r.campos.data_liberacao_fronteira).toBe('2026-10-02T18:05:00.000Z');
    expect(r.campos.data_entrega).toBe('2026-10-03T13:30:00.000Z');
    expect(r.campos.data_encerramento).toBe('2026-10-03T21:00:00.000Z');
    expect(Object.keys(r.campos).filter((k) => k.startsWith('hora_'))).toEqual([]);
  });

  it('hora sem data não se perde: vira informação extra "HH:mm"', () => {
    const aba = ler('Viagens', ['Placa cavalo', 'Origem', 'Destino', 'Hora chegada fronteira'], [
      { 'Placa cavalo': 'ABC1D23', Origem: 'URUGUAIANA', Destino: 'BUENOS AIRES', 'Hora chegada fronteira': '07:20' },
    ]);
    const r = aba.registros[0]!;
    expect(r.campos.hora_chegada_fronteira).toBeUndefined();
    expect(r.extras['Hora da chegada na fronteira']).toBe('07:20');
  });

  it('descobre o país pelo destino', () => {
    expect(paisDe('GUARAMBARÉ PY')).toBe('PY');
    expect(paisDe('Rosario/Santa Fe - AR')).toBe('AR');
    expect(paisDe('BUENOS AIRES')).toBe('AR');
  });

  it('classifica as abas pelo nome e pelas colunas, sem mapeamento manual', () => {
    const viagens = ler('Planilha1', ['PLACA', 'CARRETA', 'MOTORISTA', 'ORIGEM', 'DESTINO', 'OBS'], [
      { PLACA: 'JDE2B24', CARRETA: 'JDO5I98', MOTORISTA: 'João', ORIGEM: 'Uruguaiana', DESTINO: 'Buenos Aires', OBS: 'x' },
    ]);
    expect(viagens.tipo).toBe('viagens');
    const leia = ler('LEIA_ME', ['Texto'], [{ Texto: 'instruções' }]);
    expect(leia.tipo).toBe('ignorada');
  });

  it('cruza viagem, motorista, veículos, CRT de outra aba e checklist/SMP', () => {
    const abas = [
      ler('FOLLOWUP', ['ID_VIAGEM', 'Placa', 'Placa carreta 1', 'ID motorista', 'Nome do motorista', 'Origem', 'Destino', 'CRT nº', 'Mercadoria', 'Status'], [
        { ID_VIAGEM: 'RGB-1', Placa: 'IYA3B21', 'Placa carreta 1': 'IRS1B10', 'ID motorista': 'MOT-001', 'Nome do motorista': 'João Carlos', Origem: 'Uruguaiana', Destino: 'Rosario', 'CRT nº': 'BR.1', Mercadoria: 'Aço', Status: '13 Fronteira - despacho' },
      ]),
      ler('MOTORISTAS', ['ID_MOTORISTA', 'Nome', 'CNH categoria', 'CNH validade'], [
        { ID_MOTORISTA: 'MOT-001', Nome: 'João Carlos', 'CNH categoria': 'E', 'CNH validade': '2029-08-12' },
      ]),
      ler('AVERBACOES', ['ID_VIAGEM', 'Documento', 'Nº documento', 'Valor (R$)'], [
        { ID_VIAGEM: 'RGB-1', Documento: 'CRT', 'Nº documento': 'BR.1', 'Valor (R$)': 820000 },
        { ID_VIAGEM: 'RGB-1', Documento: 'NF', 'Nº documento': '4455', 'Valor (R$)': 1000 },
      ]),
      ler('CHECKLISTS', ['ID_CHECK', 'Placa', 'ID_VIAGEM', 'Resultado geral'], [
        { ID_CHECK: 'C1', Placa: 'IYA3B21', ID_VIAGEM: 'RGB-1', 'Resultado geral': 'Aprovado' },
      ]),
      ler('SMP', ['Nº SMP', 'ID_VIAGEM', 'Placa', 'Status'], [
        { 'Nº SMP': 'S1', ID_VIAGEM: 'RGB-1', Placa: 'IYA3B21', Status: 'Em andamento' },
      ]),
    ];
    const plano = consolidar(abas, vazia(), new Map());
    expect(plano.viagens).toHaveLength(1);
    const v = plano.viagens[0]!;
    expect(v.dados.status).toBe('NA_FRONTEIRA');
    expect(v.dados.placa_carreta).toBe('IRS1B10');
    expect(v.dados.checklist_ok).toBe(true);
    expect(v.dados.smp_ok).toBe(true);
    expect(v.cargas.map((c) => c.numero_documento).sort()).toEqual(['4455', 'BR.1']);
    expect(v.cargas.find((c) => c.numero_documento === '4455')!.tipo_documento).toBe('DANFE');
    expect(plano.motoristas).toHaveLength(1);
    expect(v.motoristaRef).toBe(plano.motoristas[0]!.ref);
    expect(plano.veiculos.map((x) => x.ref).sort()).toEqual(['IRS1B10', 'IYA3B21']);
  });

  it('reimportar atualiza a viagem ativa do mesmo cavalo em vez de duplicar', () => {
    const base = vazia();
    base.veiculos = [{ id: 'v1', placa: 'JDE2B24', tipo: 'CAVALO' }];
    base.viagens = [{ id: 'x1', placa_cavalo: 'JDE2B24', status: 'PROGRAMADA', origem: 'URUGUAIANA', destino: 'BUENOS AIRES' }];
    const abas = [
      ler('Planilha', ['PLACA', 'ORIGEM', 'DESTINO', 'OBSERVAÇÃO'], [
        { PLACA: 'JDE2B24', ORIGEM: 'URUGUAIANA', DESTINO: 'BUENOS AIRES', 'OBSERVAÇÃO': 'VEICULO LIBERADO EM LIBRES' },
      ]),
    ];
    const plano = consolidar(abas, base, new Map());
    expect(plano.viagens).toHaveLength(1);
    expect(plano.viagens[0]!.acao).toBe('atualizar');
    expect(plano.viagens[0]!.existente?.id).toBe('x1');
    expect(plano.viagens[0]!.dados.status).toBe('SAIDA_ADUANA_COTECAR');
  });
});
