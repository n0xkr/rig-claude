import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { API_BASE_URL, apiLogin, loginAs } from './helpers.js';

/**
 * Importação inteligente com a etapa de padronização: planilha de embarques no formato real da
 * operação (uma linha por LOTE, vários CRTs por caminhão, placas do conjunto numa célula, peso
 * com "9,026", datas "22.mai.2024", linha duplicada, cliente na coluna "Observações adicionais")
 * e o retrato da frota (cabeçalho na linha 4, situação em texto livre). Dados fictícios, gerados
 * por execução (placas aleatórias) para o teste poder rodar várias vezes no mesmo banco.
 */

const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const r = (n: number) => Math.floor(Math.random() * n);
/** Placa Mercosul aleatória (ABC1D23). */
const placa7 = () => `${L[r(26)]}${L[r(26)]}${L[r(26)]}${r(10)}${L[r(26)]}${r(10)}${r(10)}`;
const crt = () => `BR.9${r(900) + 100}.${r(90000) + 10000}`;

const CAB_VEGA =
  'Tipo de Veiculo;Data Solicitação;Data Coleta;Hora;Motorista;Placas;Status;Fatura Rigabras;Fatura Exportação;Lote;Emissão Fatura Rigabras;Vencimento Fatura Rigabras;Peso Bruto;Nº transporte;Nº CRT;Origem;Destino;Data Fim do Transporte;Hora Fim do transporte;Observações adicionais;';

function planilhaEmbarques() {
  const cavaloA = placa7();
  const [c1, c2] = [crt(), crt()];
  const linha = (o: {
    placas: string;
    coleta: string;
    motorista: string;
    lote: string;
    peso: string;
    crt: string;
    fim: string;
    cliente: string;
  }) =>
    `RODOTREM;08/05/2024;${o.coleta};09:00;${o.motorista};${o.placas};ENTREGUE;20659/24;272E24;${o.lote};13/mai;12/jun; ${o.peso} ;13119132;${o.crt};SÃO FRANCISCO DO SUL/SC;BUENOS AIRES/AR;${o.fim};20:36:00;${o.cliente};`;
  const conjuntoA = `${cavaloA}/${placa7()}/${placa7()}`;
  const linhas = [
    // Caminhão A: 1 viagem, 2 CRTs, 5 lotes (+1 linha duplicada)
    linha({ placas: conjuntoA, coleta: '10/05/2024', motorista: 'CONDUTOR TESTE A', lote: 'LA1', peso: '10.781,00', crt: c1, fim: '22.mai.2024', cliente: 'GONVARRI' }),
    linha({ placas: conjuntoA, coleta: '10/05/2024', motorista: 'CONDUTOR TESTE A', lote: 'LA2', peso: '9,026', crt: c1, fim: '22.mai.2024', cliente: 'GONVARRI' }),
    linha({ placas: conjuntoA, coleta: '10/05/2024', motorista: 'CONDUTOR TESTE A', lote: 'LA2', peso: '9,026', crt: c1, fim: '22.mai.2024', cliente: 'GONVARRI' }),
    linha({ placas: conjuntoA, coleta: '10/05/2024', motorista: 'CONDUTOR TESTE A', lote: 'LA3', peso: '13.602,00', crt: c1, fim: '22.mai.2024', cliente: 'GONVARRI' }),
    linha({ placas: conjuntoA, coleta: '10/05/2024', motorista: 'CONDUTOR TESTE A', lote: 'LA4', peso: '13.783,00', crt: c2, fim: '21.Mai.2024', cliente: 'GONVARRI' }),
    linha({ placas: conjuntoA, coleta: '10/05/2024', motorista: 'CONDUTOR TESTE A', lote: 'LA5', peso: '8.715', crt: c2, fim: '21.Mai.2024', cliente: 'GONVARRI' }),
  ];
  // Caminhões B..: uma viagem cada (duas linhas/lotes), placas coladas no último
  const outros: string[] = [];
  for (let i = 0; i < 9; i++) {
    const cav = placa7();
    const car = placa7();
    const placas = i === 8 ? `${cav}${car}` : `${cav}/ ${car}`;
    const c = crt();
    for (const lote of ['1', '2'])
      linhas.push(
        linha({ placas, coleta: `1${i}/06/2024`, motorista: `CONDUTOR TESTE ${i}`, lote: `L${i}${lote}`, peso: '12.000,00', crt: c, fim: `2${i}.jun.2024`, cliente: i % 2 ? 'FERROSIDER' : 'GONVARRI' }),
      );
    outros.push(cav);
  }
  const csv = `﻿${CAB_VEGA}\n${linhas.join('\n')}\n;;;;;;;;;;;;;;;;;;;;\n`;
  return { csv, cavaloA, c1, c2, cavaloColado: outros[8]!, viagens: 10 };
}

async function enviar(page: Page, nome: string, conteudo: Buffer | string) {
  await page.getByTestId('importacao-inteligente-arquivo').setInputFiles({
    name: nome,
    mimeType: nome.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: typeof conteudo === 'string' ? Buffer.from(conteudo, 'utf8') : conteudo,
  });
}

async function viagemPorPlaca(page: Page, placa: string) {
  const token = await apiLogin(page.request, 'OPERADOR');
  const h = { Authorization: `Bearer ${token}` };
  const lista = (await (await page.request.get(`${API_BASE_URL}/viagens?limit=100`, { headers: h })).json()) as {
    data: Array<{ id: string; placa_cavalo: string }>;
  };
  const v = lista.data.find((x) => x.placa_cavalo === placa);
  expect(v, `viagem do cavalo ${placa}`).toBeTruthy();
  return (await (await page.request.get(`${API_BASE_URL}/viagens/${v!.id}`, { headers: h })).json()) as Record<string, unknown> & {
    cargas?: Array<{ numero_documento: string; peso_kg: number }>;
  };
}

test.describe('Importação com padronização', () => {
  test('planilha de embarques por lote: padroniza, agrupa em viagens, soma lotes e reimportar não muda nada', async ({ page }) => {
    const p = planilhaEmbarques();
    await loginAs(page, 'OPERADOR');
    await page.goto('/importar-dados');
    await enviar(page, 'embarques.csv', p.csv);

    await expect(page.getByTestId('importacao-totais')).toContainText(`+${p.viagens}`, { timeout: 60_000 });
    await page.getByRole('button', { name: /Como cada aba foi entendida/ }).click();
    const abas = page.getByTestId('importacao-abas');
    await expect(abas).toContainText('Observações adicionais → Cliente');
    await expect(abas).toContainText('Placas → Placa do cavalo');
    await expect(abas).toContainText('Data Fim do Transporte → Chegada no destino');

    // Relatório de tratamento: tipo detectado por coluna e a linha duplicada
    await page.getByTestId('importacao-tratamento-toggle').click();
    const trat = page.getByTestId('importacao-tratamento');
    await expect(trat).toContainText('conjunto de placas');
    await expect(trat.locator('tr', { hasText: 'Peso Bruto' })).toContainText('número');
    await expect(trat.locator('tr', { hasText: 'Data Fim do Transporte' })).toContainText('data');
    await expect(page.getByTestId('importacao-tratamento-toggle')).toContainText('1 duplicada');

    await page.getByTestId('importacao-gravar').click();
    await expect(page.getByTestId('importacao-concluida')).toBeVisible({ timeout: 60_000 });

    // Conferência no banco: 1 viagem do caminhão A com os 2 CRTs e pesos somados por lote
    const v = await viagemPorPlaca(page, p.cavaloA);
    expect(v.status).toBe('ENCERRADA');
    expect(v.cliente).toBe('GONVARRI');
    expect(v.placa_carreta_2).toBeTruthy();
    expect(v.peso_kg).toBe(10781 + 9026 + 13602 + 13783 + 8715);
    const cargas = Object.fromEntries((v.cargas ?? []).map((c) => [c.numero_documento, c.peso_kg]));
    expect(cargas[p.c1]).toBe(10781 + 9026 + 13602);
    expect(cargas[p.c2]).toBe(13783 + 8715);
    expect(String(v.data_entrega)).toContain('2024-05-22');
    // Placas coladas sem separador foram separadas
    const colado = await viagemPorPlaca(page, p.cavaloColado);
    expect(colado.placa_carreta).toBeTruthy();

    // Reimportar a mesma planilha: nada a gravar
    await page.goto('/importar-dados');
    await enviar(page, 'embarques.csv', p.csv);
    await expect(page.getByTestId('importacao-gravar')).toHaveText(/Tudo já está atualizado/, { timeout: 60_000 });
    await expect(page.getByTestId('importacao-gravar')).toBeDisabled();
  });

  test('retrato da frota (cabeçalho na linha 4): etapas deduzidas do texto e veículo em manutenção sem viagem falsa', async ({ page }) => {
    const [emRetorno, manut, noPatio, liberado] = [placa7(), placa7(), placa7(), placa7()];
    const csv = [
      'PAINEL DE INFORMAÇÕES;;;;;;;;;;;;;',
      ';;;;;;;;;;;;;',
      ';;;;;;;;;;;;;',
      'Placa Cavalo;Placa Carreta;Motorista;Cliente;Origem (Ida);Destino (Ida);Pastas;Rast.;Cliente2;Origem (Ret);Destino (Ret);Rast.3;STATUS;Observações',
      `${emRetorno};${placa7()};CONDUTOR RETORNO;;;;;;TRANSPORTADORA TESTE;SANTIAGO CL;URUGUAIANA;SIM;RET.CARREGADO;VEICULO EM TRANSITO RET. URUGUAIANA`,
      `${manut};;;OFICINA TESTE;;TRES CACHOEIRAS RS;;;;;;;SEM MOTORISTA;VEICULO EM MANUTENÇÃO`,
      `${noPatio};${placa7()};CONDUTOR PATIO;RETORNOU VAZIO DA CLIENTE TESTE;;;;;;;;;PATIO RIGABRAS;VEICULO VAZIO NO PATIO RIGABRAS`,
      `${liberado};${placa7()};CONDUTOR LIBERADO;CLIENTE TESTE;URUGUAIANA;BUENOS AIRES;SIM;SIM;;;;;RAMÃO VARGAS;VEICULO LIBERADO EM LIBRES`,
      ';;;;;;;;;;;;;',
    ].join('\n');
    await loginAs(page, 'OPERADOR');
    await page.goto('/importar-dados');
    await enviar(page, 'Controle de frota.csv', csv);
    await expect(page.getByTestId('importacao-totais')).toContainText('+2', { timeout: 60_000 });
    await page.getByTestId('importacao-gravar').click();
    await expect(page.getByTestId('importacao-concluida')).toBeVisible({ timeout: 60_000 });

    const ret = await viagemPorPlaca(page, emRetorno);
    expect(ret).toMatchObject({ status: 'EM_TRANSITO_FRONTEIRA', origem: 'SANTIAGO CL', destino: 'URUGUAIANA', cliente: 'TRANSPORTADORA TESTE' });
    const lib = await viagemPorPlaca(page, liberado);
    expect(lib.status).toBe('SAIDA_ADUANA_COTECAR');

    // Acompanhamento: manutenção vem da planilha; o veículo liberado aparece em trânsito com a rota
    await page.goto('/acompanhamento');
    // A carreta engatada também cita a placa do cavalo ("engatada em ..."): a linha é a da placa exata.
    const linha = (p: string) => page.getByTestId('acomp-linha').filter({ has: page.getByText(p, { exact: true }) });
    await expect(linha(manut)).toContainText('Manutenção');
    const linhaLib = linha(liberado);
    await expect(linhaLib).toContainText('Em trânsito');
    await expect(linhaLib).toContainText('URUGUAIANA → BUENOS AIRES');
    await expect(linhaLib).toContainText('CONDUTOR LIBERADO');
  });

  test('planilha modelo: baixa, reimporta e todas as abas são reconhecidas', async ({ page }) => {
    await loginAs(page, 'OPERADOR');
    await page.goto('/importar-dados');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('gerar-planilha-modelo').click()]);
    expect(download.suggestedFilename()).toMatch(/planilha modelo\.xlsx$/);
    const conteudo = readFileSync((await download.path())!);
    await enviar(page, 'modelo.xlsx', conteudo);
    await page.getByRole('button', { name: /Como cada aba foi entendida/ }).click({ timeout: 60_000 });
    const abas = page.getByTestId('importacao-abas');
    for (const [aba, tipo] of [
      ['Viagens', 'Viagens'],
      ['Motoristas', 'Motoristas'],
      ['Veiculos', 'Veículos'],
      ['Clientes', 'Clientes'],
      ['CRT e DANFE', 'Documentos de carga'],
    ])
      await expect(abas.locator('li', { hasText: `${aba} →` }).first()).toContainText(tipo);
    // Nenhuma coluna do modelo ficou como "informação extra"
    await expect(abas.locator('li', { hasText: 'Viagens →' }).locator('span.bg-slate-100')).toHaveCount(0);
  });
});
