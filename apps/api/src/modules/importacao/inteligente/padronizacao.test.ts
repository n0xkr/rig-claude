import { describe, expect, it } from 'vitest';
import { padronizarAba, validarVolume } from './padronizacao.js';

type Linha = Record<string, string | number | boolean | null>;
const aba = (cabecalhos: string[], linhas: Linha[]) =>
  padronizarAba({ nome: 'Sheet1', cabecalhos, linhas: linhas.map((l, i) => ({ ...l, __linha: i + 2 })) });
const col = (a: ReturnType<typeof aba>, nome: string) => a.colunas.find((c) => c.coluna === nome)!;
const valores = (a: ReturnType<typeof aba>, nome: string) => a.linhas.map((l) => l[nome]);

describe('padronização (etapa 1 da importação)', () => {
  it('números: padrão BR, US e o "9,026" ambíguo resolvido pela grandeza da coluna', () => {
    const pesos = [' 10.781,00 ', '13.783,00', '9,026', '8.715', '12.465', 'R$ 1.200,50', '(1.000,00)', '14.000,00', '11.500,00', '12.000,00', 'abc'];
    const a = aba(['Peso Bruto'], pesos.map((p) => ({ 'Peso Bruto': p })));
    expect(col(a, 'Peso Bruto')).toMatchObject({ tipo: 'numero', formato: 'numero-br', inconsistencias: 1 });
    expect(valores(a, 'Peso Bruto')).toEqual([10781, 13783, 9026, 8715, 12465, 1200.5, -1000, 14000, 11500, 12000, 'abc']);
    expect(col(a, 'Peso Bruto').exemplosInconsistencia).toEqual([{ linha: 12, valor: 'abc' }]);

    const us = aba(['Amount'], ['1,234.50', '99.9', '2,000', '15'].map((v) => ({ Amount: v })));
    expect(col(us, 'Amount').formato).toBe('numero-us');
    expect(valores(us, 'Amount')).toEqual([1234.5, 99.9, 2000, 15]);
    // Decimal com 2 casas nunca vira milhar
    expect(valores(aba(['Peso'], ['25,48', '10,5', '3,25'].map((v) => ({ Peso: v }))), 'Peso')).toEqual([25.48, 10.5, 3.25]);
  });

  it('datas: dd/mm decidido pela coluna, mês por extenso, ISO, serial do Excel e data+hora', () => {
    const a = aba(['Data Coleta'], ['05/06/2024', '25/06/2024', '22.mai.2024', '2024-07-01', '3 de março de 2025'].map((v) => ({ 'Data Coleta': v })));
    expect(col(a, 'Data Coleta')).toMatchObject({ tipo: 'data', formato: 'data-dmy', inconsistencias: 0 });
    expect(valores(a, 'Data Coleta')).toEqual(['2024-06-05', '2024-06-25', '2024-05-22', '2024-07-01', '2025-03-03']);

    const mdy = aba(['Date'], ['06/25/2024', '07/04/2024'].map((v) => ({ Date: v })));
    expect(valores(mdy, 'Date')).toEqual(['2024-06-25', '2024-07-04']);

    const serial = aba(['Data Emissão'], [{ 'Data Emissão': 45423 }, { 'Data Emissão': 45424.5 }]);
    expect(col(serial, 'Data Emissão').tipo).toBe('datahora');
    expect(valores(serial, 'Data Emissão')).toEqual(['2024-05-11', '2024-05-12T12:00']);

    const invalida = aba(['Data'], ['31/02/2024', '01/03/2024', '02/03/2024', '03/03/2024', '04/03/2024', '05/03/2024', '06/03/2024', '07/03/2024', '08/03/2024', '09/03/2024'].map((v) => ({ Data: v })));
    expect(col(invalida, 'Data').inconsistencias).toBe(1);
    expect(valores(invalida, 'Data')[0]).toBe('31/02/2024');
  });

  it('hora, sim/não, placas, código e texto', () => {
    const a = aba(
      ['Hora', 'Pesquisa GR', 'Placas', 'Placa', 'Nº transporte', 'Nº CRT', 'Motorista'],
      [
        { Hora: '09:00', 'Pesquisa GR': 'Sim', Placas: 'mlm1e90/MMA9I46', Placa: 'IIK-3294', 'Nº transporte': 13119132, 'Nº CRT': 'BR.2715.15741', Motorista: '  JOÃO  DA SILVA ' },
        { Hora: '1899-12-30T20:36', 'Pesquisa GR': 'NÃO', Placas: 'JDE5H07IZR9B80', Placa: 'ABC1D23', 'Nº transporte': 'P001074871', 'Nº CRT': 'BR.2715.15742', Motorista: 'MARIA' },
        { Hora: '7h30', 'Pesquisa GR': 'x', Placas: 'QIF9G54 / ITS7J01', Placa: 'abc 1234', 'Nº transporte': '00123', 'Nº CRT': null, Motorista: null },
      ],
    );
    expect(valores(a, 'Hora')).toEqual(['09:00', '20:36', '07:30']);
    expect(valores(a, 'Pesquisa GR')).toEqual([true, false, true]);
    expect(col(a, 'Placas').tipo).toBe('placas');
    expect(valores(a, 'Placas')).toEqual(['MLM1E90/MMA9I46', 'JDE5H07/IZR9B80', 'QIF9G54/ITS7J01']);
    expect(valores(a, 'Placa')).toEqual(['IIK3294', 'ABC1D23', 'ABC1234']);
    expect(col(a, 'Nº transporte').tipo).toBe('codigo');
    expect(valores(a, 'Nº transporte')).toEqual(['13119132', 'P001074871', '00123']);
    expect(valores(a, 'Motorista')).toEqual(['JOÃO DA SILVA', 'MARIA', null]);
  });

  it('descarta linha vazia, cabeçalho repetido e total — com o motivo; conta duplicadas', () => {
    const a = aba(
      ['Placa', 'Peso'],
      [
        { Placa: 'ABC1D23', Peso: '10.000,00' },
        { Placa: '', Peso: '-' },
        { Placa: 'Placa', Peso: 'Peso' },
        { Placa: 'ABC1D23', Peso: '10.000,00' },
        { Placa: 'TOTAL', Peso: '20.000,00' },
      ],
    );
    expect(a.linhas).toHaveLength(2);
    expect(a.duplicadas).toBe(1);
    expect(a.descartadas).toEqual([
      { linha: 3, motivo: 'linha vazia' },
      { linha: 4, motivo: 'cabeçalho repetido' },
      { linha: 6, motivo: 'linha de total' },
    ]);
  });

  it('segurança: cabeçalho __proto__ neutralizado, célula-objeto recusada, volume limitado', () => {
    const a = padronizarAba({
      nome: 'x',
      cabecalhos: ['__proto__', 'constructor', 'Obs'],
      linhas: [{ __proto__: 'a', constructor: 'b', Obs: 'ok' } as unknown as Linha],
    });
    expect(a.cabecalhos).toEqual(['Coluna proto', 'Coluna constructor', 'Obs']);
    expect(Object.getPrototypeOf(a.linhas[0])).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(validarVolume([{ abas: [{ nome: 'a', cabecalhos: Array(300).fill('c'), linhas: Array(20000).fill({}) }] }])).toMatch(/grandes demais/);
    expect(validarVolume([{ abas: [{ nome: 'a', cabecalhos: ['c'], linhas: [{}] }] }])).toBeNull();
  });
});
