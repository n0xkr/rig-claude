import { describe, expect, it } from 'vitest';
import { interpretarArquivos } from './inteligente.service.js';
import { consolidar } from './consolidacao.js';
import { descobrirCamposNovos, marcarNovos } from './camposPersonalizados.js';

const cabecalhos = ['Placa cavalo', 'Origem', 'Destino', 'Hora do lacre', 'Temperatura', 'Lacre', 'Vistoria feita', 'Vistoria realizada em'];
const linhas = [
  { 'Placa cavalo': 'ABC1D23', Origem: 'URUGUAIANA', Destino: 'BUENOS AIRES', 'Hora do lacre': '07:20', 'Temperatura': '4,5', Lacre: 'L-778', 'Vistoria feita': 'Sim', 'Vistoria realizada em': '02/10/2026 09:30' },
  { 'Placa cavalo': 'DEF4G56', Origem: 'URUGUAIANA', Destino: 'ROSARIO', 'Hora do lacre': '13h45', 'Temperatura': '5', Lacre: 'L-779', 'Vistoria feita': 'Não', 'Vistoria realizada em': '03/10/2026 16:00' },
];

describe('campos personalizados (colunas novas da planilha)', () => {
  it('cada coluna nova vira um campo com o tipo detectado — inclusive horários — e o valor fica em dados_extras', async () => {
    const { abas } = await interpretarArquivos({ arquivos: [{ nome: 't.xlsx', abas: [{ nome: 'Viagens', cabecalhos, linhas }] }] });
    expect(abas[0]!.tipo).toBe('viagens');

    const campos = descobrirCamposNovos(abas);
    const por = Object.fromEntries(campos.map((c) => [c.chave, c]));
    expect(por['Hora do lacre']).toMatchObject({ entidade: 'viagens', tipo: 'hora', preenchidas: 2 });
    expect(por['Temperatura']).toMatchObject({ tipo: 'numero' });
    expect(por['Lacre']).toMatchObject({ tipo: 'texto' });
    expect(por['Vistoria feita']).toMatchObject({ tipo: 'booleano' });
    expect(por['Vistoria realizada em']).toMatchObject({ tipo: 'datahora' });

    // Catálogo já tem um deles: só os outros são "novos".
    const marcados = marcarNovos(campos, new Set(['viagens|Lacre']));
    expect(marcados.find((c) => c.chave === 'Lacre')!.novo).toBe(false);
    expect(marcados.find((c) => c.chave === 'Hora do lacre')!.novo).toBe(true);
    // Sem catálogo (migration pendente) tudo é tratado como novo.
    expect(marcarNovos(campos, null).every((c) => c.novo)).toBe(true);

    const plano = consolidar(abas, { veiculos: [], motoristas: [], clientes: [], viagens: [], cargasPorViagem: new Map() }, new Map());
    const extras = plano.viagens[0]!.dados.dados_extras as Record<string, unknown>;
    expect(extras['Hora do lacre']).toBe('07:20');
    expect(extras['Temperatura']).toBe(4.5);
    expect(extras['Vistoria feita']).toBe(true);
    expect(extras['Vistoria realizada em']).toBe('2026-10-02T09:30');
  });
});
