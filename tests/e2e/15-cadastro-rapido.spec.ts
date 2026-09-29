import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAs } from './helpers.js';

/**
 * "+ Adicionar novo" nos seletores: o cadastro que falta é feito num modal, sem sair do
 * formulário, e o registro novo já volta selecionado. Cada cenário termina enviando o
 * formulário de origem de verdade.
 */

const sufixo = () => Date.now().toString().slice(-7);
const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const r = (n: number) => Math.floor(Math.random() * n);
const placa7 = () => `${L[r(26)]}${L[r(26)]}${L[r(26)]}${r(10)}${L[r(26)]}${r(10)}${r(10)}`;

/** Valor da opção + Adicionar novo (o rótulo varia: + Novo armazém...). */
const NOVO = '__novo__';

/** Escolhe "+ Adicionar novo" no select, preenche o modal e salva; devolve o modal (já fechado). */
async function cadastrarPeloSelect(page: Page, select: Locator, tipo: string, campos: Record<string, string>) {
  await select.selectOption({ value: NOVO });
  const modal = page.getByTestId(`cadastro-rapido-${tipo}`);
  await expect(modal).toBeVisible();
  for (const [rotulo, valor] of Object.entries(campos)) await modal.getByLabel(rotulo).fill(valor);
  await modal.getByRole('button', { name: 'Salvar e selecionar' }).click();
  await expect(modal).toHaveCount(0);
}

const selecionado = (select: Locator) => select.evaluate((s: HTMLSelectElement) => s.options[s.selectedIndex]?.text ?? '');

test.describe('Cadastro rápido dentro dos formulários', () => {
  test('Nova expedição: cria depositante e produto no próprio formulário e solicita', async ({ page }) => {
    await loginAs(page, 'OPERADOR');
    await page.goto('/wms/expedicoes/nova');
    const dep = `Depositante PW ${sufixo()}`;
    const selDep = page.getByLabel('Depositante *');
    await cadastrarPeloSelect(page, selDep, 'depositante', { 'Razão social *': dep, 'CNPJ/CPF *': '11.222.333/0001-81' });
    await expect.poll(() => selecionado(selDep)).toBe(dep);
    await expect(page).toHaveURL(/\/wms\/expedicoes\/nova$/); // o formulário de fora não foi enviado

    const sku = `PW-${sufixo()}`;
    const selProd = page.locator('form').getByRole('combobox').nth(2);
    await cadastrarPeloSelect(page, selProd, 'produto', { 'SKU / código *': sku, 'Descrição *': 'Bobina de aço' });
    await expect.poll(() => selecionado(selProd)).toContain(sku);

    await page.getByPlaceholder('Qtd.').fill('3');
    await page.getByRole('button', { name: 'Solicitar expedição' }).click();
    await expect(page).toHaveURL(/\/wms\/expedicoes\/[0-9a-f-]{36}$/);
  });

  test('Recebimento: depositante e produto novos, endereço novo na conferência, conclui', async ({ page }) => {
    await loginAs(page, 'OPERADOR');
    await page.goto('/wms/recebimentos/novo');
    const dep = `Depositante Rec ${sufixo()}`;
    await cadastrarPeloSelect(page, page.getByLabel('Depositante *'), 'depositante', { 'Razão social *': dep, 'CNPJ/CPF *': '22.333.444/0001-05' });
    const sku = `RC-${sufixo()}`;
    await cadastrarPeloSelect(page, page.locator('form').getByRole('combobox').nth(1), 'produto', { 'SKU / código *': sku, 'Descrição *': 'Palete' });
    await page.getByPlaceholder('Qtd.').fill('5');
    await page.getByRole('button', { name: 'Registrar recebimento' }).click();
    await page.getByRole('button', { name: 'Iniciar conferência' }).click();
    await expect(page.getByRole('button', { name: 'Iniciar conferência' })).toHaveCount(0);

    const rua = `R${sufixo()}`;
    const selEnd = page.getByRole('combobox').last();
    await cadastrarPeloSelect(page, selEnd, 'endereco', { 'Área *': 'A', 'Rua *': rua, 'Prateleira *': '01', 'Posição *': '01' });
    await expect.poll(() => selecionado(selEnd)).toContain(rua);
    await page.getByRole('button', { name: 'Conferir' }).click();
    await expect(page.getByText('conferido: 5')).toBeVisible();
    await page.getByRole('button', { name: 'Concluir conferência' }).click();
    await expect(page.getByText('ENDERECADO', { exact: true })).toBeVisible();
  });

  test('Mapa do armazém: cria armazém pelo seletor e um endereço nele', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await page.goto('/wms/armazem/mapa');
    const nome = `Armazém PW ${sufixo()}`;
    const sel = page.getByTestId('armazem-select');
    await cadastrarPeloSelect(page, sel, 'armazem', { 'Nome *': nome });
    await expect.poll(() => selecionado(sel)).toBe(nome);
    await expect(page.getByText('Nenhum endereço cadastrado')).toBeVisible();
    await page.getByRole('button', { name: 'Novo endereço' }).click();
    await page.getByPlaceholder('Área').fill('B');
    await page.getByPlaceholder('Rua').fill('02');
    await page.getByPlaceholder('Prateleira').fill('03');
    await page.getByPlaceholder('Posição').fill('04');
    await page.getByRole('button', { name: 'Criar' }).click();
    await expect(page.getByText('02-03-04')).toBeVisible();
  });

  test('Nova viagem: cavalo, carreta e motorista cadastrados sem sair do formulário', async ({ page }) => {
    await loginAs(page, 'OPERADOR');
    await page.goto('/viagens/nova');
    const cavalo = placa7();
    const selCavalo = page.getByLabel('Placa do cavalo *');
    await cadastrarPeloSelect(page, selCavalo, 'veiculo', { 'Placa *': cavalo, Marca: 'Scania' });
    await expect.poll(() => selecionado(selCavalo)).toContain(cavalo);

    const carreta = placa7();
    await page.getByTestId('viagem-placa-carreta').locator('..').getByRole('button', { name: 'Novo' }).click();
    const modal = page.getByTestId('cadastro-rapido-veiculo');
    await expect(modal.getByLabel('Tipo')).toHaveValue('CARRETA_OUTRO');
    await modal.getByLabel('Placa *').fill(carreta);
    await modal.getByRole('button', { name: 'Salvar e selecionar' }).click();
    await expect(page.getByTestId('viagem-placa-carreta')).toHaveValue(carreta);

    const motorista = `MOTORISTA RAPIDO ${sufixo()}`;
    const selMot = page.getByLabel('Motorista *');
    await cadastrarPeloSelect(page, selMot, 'motorista', { 'Nome completo *': motorista });
    await expect.poll(() => selecionado(selMot)).toBe(motorista);

    await page.getByLabel('Origem *').fill('Uruguaiana/RS');
    await page.getByLabel('Destino *', { exact: true }).fill('Rosario/AR');
    await page.getByRole('button', { name: 'Criar viagem' }).click();
    await expect(page).toHaveURL(/\/viagens$/);
    await page.getByText(cavalo).first().click();
    await expect(page.getByText('Uruguaiana/RS → Rosario/AR')).toBeVisible();
    await expect(page.getByText(motorista).first()).toBeVisible();
    await expect(page.getByText(carreta).first()).toBeVisible();
  });

  test('Manutenção: veículo novo pelo seletor e registro salvo', async ({ page }) => {
    await loginAs(page, 'OPERADOR');
    await page.goto('/frota/manutencoes/nova');
    const placa = placa7();
    const sel = page.getByLabel('Veículo *');
    await cadastrarPeloSelect(page, sel, 'veiculo', { 'Placa *': placa });
    await expect.poll(() => selecionado(sel)).toContain(placa);
    await page.getByLabel('Custo (R$) *').fill('850');
    await page.getByRole('button', { name: /Registrar manutenção|Salvar/ }).click();
    await expect(page).toHaveURL(/\/frota\/manutencoes$/);
    await expect(page.getByText(placa).first()).toBeVisible();
  });

  test('Jornada: motorista novo e evento registrado', async ({ page }) => {
    await loginAs(page, 'OPERADOR');
    await page.goto('/jornada');
    const nome = `MOTORISTA JORNADA ${sufixo()}`;
    const sel = page.locator('form').getByRole('combobox').first();
    await cadastrarPeloSelect(page, sel, 'motorista', { 'Nome completo *': nome });
    await expect.poll(() => selecionado(sel)).toBe(nome);
    await page.getByRole('button', { name: /Registrar/ }).click();
    await expect(page.getByText('Evento registrado com sucesso.')).toBeVisible();
  });

  test('Avarias: produto novo escolhendo o depositante dentro do modal', async ({ page }) => {
    await loginAs(page, 'OPERADOR');
    // depositante existente para o vínculo do produto
    await page.goto('/wms/expedicoes/nova');
    const dep = `Depositante Av ${sufixo()}`;
    await cadastrarPeloSelect(page, page.getByLabel('Depositante *'), 'depositante', { 'Razão social *': dep, 'CNPJ/CPF *': '33.444.555/0001-10' });

    await page.goto('/wms/avarias');
    await page.getByRole('button', { name: 'Nova avaria' }).click();
    const sel = page.locator('form').getByRole('combobox').first();
    await sel.selectOption({ value: NOVO });
    const modal = page.getByTestId('cadastro-rapido-produto');
    await modal.getByLabel('Depositante *').selectOption({ label: dep });
    const sku = `AV-${sufixo()}`;
    await modal.getByLabel('SKU / código *').fill(sku);
    await modal.getByLabel('Descrição *').fill('Caixa amassada');
    await modal.getByRole('button', { name: 'Salvar e selecionar' }).click();
    await expect.poll(() => selecionado(sel)).toContain(sku);
    await page.getByPlaceholder('Quantidade').fill('1');
    await page.getByPlaceholder('Descrição').fill('Queda na descarga');
    await page.getByRole('button', { name: 'Registrar avaria' }).click();
    await expect(page.getByText('Queda na descarga')).toBeVisible();
  });
});
