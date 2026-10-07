import { describe, expect, it } from 'vitest';
import { statusViagemDeTexto } from '@rigabras/shared';
import { classificarAba, lerDataHora, lerRegistros, type AbaLida, type TipoDados } from './interpretacao.js';
import { consolidar, nomesCompativeis, type BaseExistente, type Row } from './consolidacao.js';
import { clienteDoTexto } from './retratos.js';

// Casos tirados da planilha real "Controle de frota.xlsx" (abas CAVALOS, CARRETAS, MOTORISTAS,
// CRONOTACÓGRAFO, REVISÃO TÉCNICA, HISTORICO DE POSIÇÕES, Controle de Frota).

function ler(nome: string, cabecalhos: string[], linhas: Array<Record<string, unknown>>): AbaLida {
  const aba = { nome, cabecalhos, linhas: linhas.map((l, i) => ({ __linha: i + 2, ...l })) };
  const c = classificarAba(aba);
  const tipo = c?.tipo ?? 'ignorada';
  return {
    tipo,
    registros: tipo === 'ignorada' ? [] : lerRegistros('frota.xlsx', aba, tipo as TipoDados, c!.mapa!.porColuna),
    info: { arquivo: 'frota.xlsx', aba: nome, tipo, origemTipo: 'dicionario', linhas: linhas.length, colunas: [] },
  };
}
const vazia = (): BaseExistente => ({ veiculos: [], motoristas: [], clientes: [], viagens: [], cargasPorViagem: new Map() });

const HIST = ['DATA', 'Placa Cavalo', 'Placa Carreta', 'Motorista', 'Cliente', 'Origem (Ida)', 'Destino (Ida)', 'Cliente2', 'Origem (Ret)', 'Destino (Ret)', 'STATUS', 'Observações'];
const h = (DATA: string, placa: string, o: Record<string, unknown>) => ({ DATA, 'Placa Cavalo': placa, ...o });
/** 2 cavalos x vários dias: dá para ver ida, volta, dia parado e volta carregada com outro cliente. */
const HISTORICO = [
  h('2026-08-18', 'JDE5H01', { 'Placa Carreta': 'JAB0166', Motorista: 'JUAREZ PAHIM', Cliente: 'FRIMETAL', 'Origem (Ida)': 'Uruguaiana', 'Destino (Ida)': 'ROSÁRIO AR', STATUS: 'INDO CARREGADO', Observações: 'VEICULO ESTA NA COTECAR AGUARDANDO LIBERAÇÃO' }),
  h('2026-08-19', 'JDE5H01', { 'Placa Carreta': 'JAB0166', Motorista: 'JUAREZ PAHIM', Cliente: 'FRIMETAL', 'Origem (Ida)': 'Uruguaiana', 'Destino (Ida)': 'ROSÁRIO AR', STATUS: 'INDO CARREGADO', Observações: 'VEICULO EM TRANSITO DESTINO FRIMETAL' }),
  h('2026-08-20', 'JDE5H01', { 'Placa Carreta': 'JAB0166', Motorista: 'JUAREZ PAHIM', Cliente: 'FRIMETAL', 'Origem (Ida)': 'URUGUAIANA', 'Destino (Ida)': 'ROSÁRIO AR', Cliente2: 'VAZIO', STATUS: 'RET.VAZIO', Observações: 'VEICULO RETORNANDO VAZIO' }),
  h('2026-08-21', 'JDE5H01', { Motorista: 'JUAREZ PAHIM', Cliente: 'RETORNOU FRIMETAL', STATUS: 'NO PATIO', Observações: 'VEICULO ESTA NO PATIO DA RIGABRAS' }),
  h('2026-08-22', 'JDE5H01', { STATUS: 'SEM MOTORISTA' }),
  h('2026-08-24', 'JDE5H01', { 'Placa Carreta': 'JDO1E73', Motorista: 'JUAREZ PAHIM', Cliente: 'BALL PY', 'Origem (Ida)': 'URUGUAIANA', 'Destino (Ida)': 'GUARAMBARÉ PY', STATUS: 'EM ADUANA', Observações: 'VEICULO NA MULTILOG AGUARDANDO LIBERAÇÃO' }),
  h('2026-08-25', 'JDE5H01', { 'Placa Carreta': 'JDO1E73', Motorista: 'JUAREZ PAHIM', Cliente: 'RETORNANDO VAZIO DA BALL PY', STATUS: 'RET.VAZIO', Observações: 'VEICULO EM TRANSITO RET. URUGUAIANA' }),
  h('2026-08-18', 'JCR9G17', { Motorista: 'CARLOS DUTRA', Cliente: 'ARROZ URBANO', 'Origem (Ida)': 'URUGUAIANA', 'Destino (Ida)': 'SÃO GABRIEL RS', STATUS: 'PROGRAMADO', Observações: 'VEICULO VAI CARREGAR EM SÃO GABRIEL' }),
  h('2026-08-19', 'JCR9G17', { Motorista: 'CARLOS DUTRA', Cliente: 'ARROZ URBANO', 'Origem (Ida)': 'SÃO GABRIEL RS', 'Destino (Ida)': 'JARAGUA SUL SC', Cliente2: 'UNIAAÇO', 'Origem (Ret)': 'CORUPA SC', STATUS: 'INDO CARREGADO', Observações: 'VEICULO EM TRANSITO DESTINO JARAGUA SUL' }),
  h('2026-08-20', 'JCR9G17', { Motorista: 'CARLOS DUTRA', Cliente2: 'UNIAAÇO', 'Origem (Ret)': 'CORUPA SC', 'Destino (Ret)': 'URUGUAIANA', STATUS: 'AG.CARREGAR', Observações: 'VEICULO ESTA NA UNIAAÇO' }),
  h('2026-08-21', 'JCR9G17', { Motorista: 'CARLOS DUTRA', Cliente2: 'UNIAAÇO', 'Origem (Ret)': 'CORUPA SC', 'Destino (Ret)': 'URUGUAIANA', STATUS: 'RET.CARREGADO', Observações: 'VEICULO EM TRANSITO RET. URUGUAIANA' }),
  h('2026-08-22', 'JCR9G17', { STATUS: 'SEM MOTORISTA' }),
  h('2026-08-24', 'JCR9G17', { STATUS: 'SEM MOTORISTA' }),
  h('2026-08-25', 'JCR9G17', { Motorista: 'CARLOS DUTRA', Cliente: 'DIGITAL DIESEL', 'Destino (Ida)': 'TRES CACHOEIRAS RS', STATUS: 'SEM MOTORISTA', Observações: 'VEICULO EM MANUTENÇÃO' }),
];
// Completa o retrato: outros cavalos parados todos os dias (a aba real tem 32 cavalos por dia).
for (const d of ['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-24', '2026-08-25'])
  for (const p of ['JDE5H02', 'JDE5H03']) HISTORICO.push(h(d, p, { STATUS: 'SEM MOTORISTA' }));

describe('planilha de frota real (Controle de frota.xlsx)', () => {
  it('abas CAVALOS/CARRETAS: a coluna com o nome da aba é a placa e o tipo vem da aba', () => {
    const cav = ler('CAVALOS', ['CAVALOS', 'MARCA', 'MODELO', 'ANO', 'TARA', 'HOJE'], [
      { CAVALOS: 'JDE5H01', MARCA: 'SCANIA', MODELO: 'P 410', ANO: 2021, TARA: 7890, HOJE: '2026-09-26' },
    ]);
    const car = ler('CARRETAS', ['CARRETAS', 'MARCA', 'TIPO', 'ANO', 'PISO', 'TARA'], [
      { CARRETAS: 'JDE5E04', MARCA: 'FACCHINI', TIPO: 'ABERTA', ANO: 2021, PISO: 'FERRO', TARA: 9650 },
    ]);
    const rev = ler('REVISÃO TÉCNICA', ['PLACA', 'Tipo de Veiculo', 'Periodicidade', 'Data da última Revisão', 'Data da Validade', 'Status'], [
      { PLACA: 'JDE5E04', 'Tipo de Veiculo': 'Semi-Reboque', Periodicidade: 'Anual', 'Data da última Revisão': '2026-02-20', 'Data da Validade': '2027-02-20', Status: 'OK' },
    ]);
    expect([cav.tipo, car.tipo, rev.tipo]).toEqual(['veiculos', 'veiculos', 'veiculos']);
    const plano = consolidar([cav, car, rev], vazia(), new Map());
    const por = Object.fromEntries(plano.veiculos.map((v) => [v.ref, v.dados]));
    expect(por.JDE5H01).toMatchObject({ tipo: 'CAVALO', marca: 'SCANIA', modelo: 'P 410', ano_fabricacao: 2021, frota_propria: true });
    expect((por.JDE5H01!.dados_extras as Row).HOJE).toBeUndefined(); // coluna auxiliar de fórmula
    // "Semi-Reboque" da revisão não apaga o "ABERTA"; a validade é da inspeção técnica, não manutenção.
    expect(por.JDE5E04).toMatchObject({ tipo: 'CARRETA_ABERTA', inspecao_tecnica_validade: '2027-02-20' });
    expect(por.JDE5E04!.ultima_manutencao_data).toBeUndefined();
    expect(por.JDE5E04!.status_operacional).toBeUndefined();
    expect((por.JDE5E04!.dados_extras as Row)['REVISÃO TÉCNICA › Status']).toBe('OK');
  });

  it('CRONOTACÓGRAFO: marca/status do instrumento não viram marca/situação do veículo', () => {
    const cab = ['Placa', 'Renavam', 'Marca do Cronotacógrafo', 'Capacidade', 'Data da última Calibração', 'Data da Validade Calibração', 'Status da Calibração'];
    const aba = ler('CRONOTACÓGRAFO', cab, [
      { Placa: 'JDE5H01', Renavam: 1257091414, 'Marca do Cronotacógrafo': 'CONTINENTAL', Capacidade: 'N/A', 'Data da última Calibração': '2025-03-26', 'Data da Validade Calibração': '2027-03-07', 'Status da Calibração': 'J' },
    ]);
    expect(aba.tipo).toBe('veiculos');
    const v = consolidar([aba], vazia(), new Map()).veiculos[0]!.dados;
    expect(v.tacografo_validade).toBe('2027-03-07');
    expect(v.marca).toBeUndefined();
    expect(v.status_operacional).toBeUndefined();
    expect((v.dados_extras as Row)['CRONOTACÓGRAFO › Marca do Cronotacógrafo']).toBe('CONTINENTAL');
  });

  it('MOTORISTAS: validade da CNH, RG e MOPP em texto; nome curto e completo são a mesma pessoa', () => {
    const mot = ler('MOTORISTAS', ['MOTORISTA', 'CPF', 'RG', 'Nº CNH', 'VENC/CNH', 'Mop'], [
      { MOTORISTA: 'CLEBER BALDEZ', CPF: '015.414.280-80', RG: 1098892779, 'Nº CNH': '2628590571', 'VENC/CNH': '2033-06-23', Mop: 'Não possui' },
      { MOTORISTA: 'EDGAR', CPF: '012.960.450-05', 'Nº CNH': '2213546428', 'VENC/CNH': '2031-04-27', Mop: 'Possui - 18/07/2026' },
    ]);
    const vega = ler('Sheet1', ['Data Coleta', 'Motorista', 'Placas', 'Status', 'Nº CRT', 'Origem', 'Destino'], [
      { 'Data Coleta': '10/05/2024', Motorista: 'CLEBER DA SILVA BALDEZ', Placas: 'JDE5H01/JDE5E04', Status: 'ENTREGUE', 'Nº CRT': 'BR.1', Origem: 'ITAJAÍ/SC', Destino: 'BUENOS AIRES/AR' },
      { 'Data Coleta': '12/05/2024', Motorista: 'EDGAR JOSUE DE MOURA', Placas: 'JDE5H02/JDE5E05', Status: 'ENTREGUE', 'Nº CRT': 'BR.2', Origem: 'ITAJAÍ/SC', Destino: 'BUENOS AIRES/AR' },
    ]);
    const plano = consolidar([mot, vega], vazia(), new Map());
    expect(plano.motoristas).toHaveLength(2);
    const cleber = plano.motoristas.find((m) => m.dados.cpf === '01541428080')!.dados;
    expect(cleber).toMatchObject({ nome_completo: 'CLEBER DA SILVA BALDEZ', apelido: 'CLEBER BALDEZ', rg: '1098892779', cnh_validade: '2033-06-23', mopp: false, frota_propria: true });
    const edgar = plano.motoristas.find((m) => m.dados.cpf === '01296045005')!.dados;
    expect(edgar).toMatchObject({ nome_completo: 'EDGAR JOSUE DE MOURA', mopp: true, mopp_validade: '2026-07-18' });
    expect(nomesCompativeis('MARCELO', 'MARCELO ALVES')).toBe(true);
    expect(nomesCompativeis('MARCELO ALVES', 'MARCELO BRUM')).toBe(false);
  });

  it('nome curto ambíguo (dois "MARCELO ..." diferentes) não é juntado', () => {
    const vega = ler('Sheet1', ['Data Coleta', 'Motorista', 'Placas', 'Nº CRT', 'Origem', 'Destino'], [
      { 'Data Coleta': '10/05/2024', Motorista: 'MARCELO ALVES', Placas: 'MLM1E90', 'Nº CRT': 'BR.1', Origem: 'A', Destino: 'B' },
      { 'Data Coleta': '11/05/2024', Motorista: 'MARCELO BRUM', Placas: 'MLM1E91', 'Nº CRT': 'BR.2', Origem: 'A', Destino: 'B' },
      { 'Data Coleta': '12/05/2024', Motorista: 'MARCELO', Placas: 'MLM1E92', 'Nº CRT': 'BR.3', Origem: 'A', Destino: 'B' },
    ]);
    expect(consolidar([vega], vazia(), new Map()).motoristas).toHaveLength(3);
  });

  it('HISTORICO DE POSIÇÕES: os dias de cada viagem viram uma viagem; o retrato atual completa a aberta', () => {
    const hist = ler('HISTORICO DE POSIÇÕES', HIST, HISTORICO);
    expect(hist.tipo).toBe('viagens');
    const atual = ler('Controle de Frota', HIST.slice(1), [
      { 'Placa Cavalo': 'JDE5H01', 'Placa Carreta': 'JDO1E73', Motorista: 'JUAREZ PAHIM', Cliente: 'RETORNANDO VAZIO DA BALL PY', STATUS: 'RET.VAZIO', Observações: 'VEICULO EM TRANSITO RET. URUGUAIANA' },
    ]);
    const plano = consolidar([atual, hist], vazia(), new Map());
    const resumo = plano.viagens.map((v) => [v.dados.placa_cavalo, v.dados.cliente, v.dados.origem, v.dados.destino, v.dados.status]);
    expect(resumo).toEqual([
      ['JDE5H01', 'FRIMETAL', 'URUGUAIANA', 'ROSÁRIO AR', 'ENCERRADA'],
      ['JDE5H01', 'BALL PY', 'URUGUAIANA', 'GUARAMBARÉ PY', 'RETORNANDO_VAZIO'],
      // A ida muda de rota (vai vazio carregar, depois segue carregado): vale a rota carregada.
      ['JCR9G17', 'ARROZ URBANO', 'SÃO GABRIEL RS', 'JARAGUA SUL SC', 'ENCERRADA'],
      // A volta carregada é outra viagem, de outro cliente.
      ['JCR9G17', 'UNIAAÇO', 'CORUPA SC', 'URUGUAIANA', 'ENCERRADA'],
    ]);
    const frimetal = plano.viagens[0]!;
    expect(frimetal.dados.data_programacao).toBe(lerDataHora('2026-08-18'));
    expect(frimetal.dados.data_encerramento).toBeDefined();
    expect((frimetal.dados.dados_extras as Row)['Período no histórico']).toBe('18/08/2026 a 21/08/2026');
    // A linha do retrato atual entrou na viagem aberta em vez de abrir outra "Não informado".
    expect(plano.viagens[1]!.fontes.some((f) => f.includes('Controle de Frota'))).toBe(true);
    // Manutenção na DIGITAL DIESEL não é viagem nem cliente.
    expect(plano.clientes.map((c) => c.dados.nome)).not.toContain('DIGITAL DIESEL');
    // Motoristas da própria frota (nenhum cavalo de terceiro no histórico).
    expect(plano.motoristas.every((m) => m.dados.frota_propria !== false)).toBe(true);
  });

  it('reimportar o histórico não duplica viagens (casa por cavalo + dia)', () => {
    const hist = ler('HISTORICO DE POSIÇÕES', HIST, HISTORICO);
    const primeiro = consolidar([hist], vazia(), new Map());
    const base: BaseExistente = {
      ...vazia(),
      viagens: primeiro.viagens.map((v, i) => ({ id: `v${i}`, ...v.dados })),
    };
    const segundo = consolidar([ler('HISTORICO DE POSIÇÕES', HIST, HISTORICO)], base, new Map());
    expect(segundo.viagens.filter((v) => v.acao === 'criar')).toHaveLength(0);
  });

  it('textos de situação na coluna de cliente e códigos curtos de status', () => {
    expect(clienteDoTexto('VAI RETORNAR VAZIO DA BALL CHILE')).toEqual({ cliente: 'BALL CHILE', retorno: true });
    expect(clienteDoTexto('RETORNOU DA ACINDAR VAZIO')).toEqual({ cliente: 'ACINDAR', retorno: true });
    expect(clienteDoTexto('VAZIO NA FERROSIDER')).toEqual({ cliente: 'FERROSIDER', retorno: true });
    expect(clienteDoTexto('VEICULOS JDE5H08 E JDE5H10 REMONTADOS').cliente).toBeUndefined();
    expect(clienteDoTexto('GONVARRI')).toEqual({ cliente: 'GONVARRI', retorno: false });
    expect(statusViagemDeTexto('INDO CARREGADO')).toBe('EM_TRANSITO_FRONTEIRA');
    expect(statusViagemDeTexto('AG.DESCARREGAR')).toBe('CHEGADA_CLIENTE');
    expect(statusViagemDeTexto('AG.CARREGAR')).toBe('PROGRAMADO_CARREGAR');
  });
});
