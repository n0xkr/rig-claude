import { describe, expect, it } from 'vitest';
import { statusViagemDeTexto } from '@rigabras/shared';
import { classificarAba, lerRegistros, type AbaLida, type TipoDados } from './interpretacao.js';
import { consolidar, paisDe, type BaseExistente } from './consolidacao.js';

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
