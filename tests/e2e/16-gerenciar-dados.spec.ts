import { test, expect } from '@playwright/test';
import { API_BASE_URL, apiLogin, loginAs } from './helpers.js';

/**
 * Gerenciar dados (SUPERADMIN): adicionar, editar, mandar para a lixeira, restaurar e apagar
 * qualquer registro, numa tela só. ADMIN/OPERADOR não têm acesso (API responde 403).
 */

const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const r = (n: number) => Math.floor(Math.random() * n);
const placa7 = () => `${L[r(26)]}${L[r(26)]}${L[r(26)]}${r(10)}${L[r(26)]}${r(10)}${r(10)}`;

test.describe('Gerenciar dados (SUPERADMIN)', () => {
  test('cria, edita, envia para a lixeira, restaura e apaga um veículo', async ({ page, request }) => {
    // Garante ao menos um veículo (o banco falso deduz as colunas dos registros existentes).
    const token = await apiLogin(request, 'SUPERADMIN');
    const base = placa7();
    const pre = await request.post(`${API_BASE_URL}/veiculos`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { placa: base, tipo: 'CAVALO', frota_propria: true, marca: 'MERCEDES' },
    });
    expect(pre.ok(), await pre.text()).toBeTruthy();

    await loginAs(page, 'SUPERADMIN');
    await page.goto('/gerenciar-dados');
    await expect(page.getByTestId('gerenciar-dados-page')).toBeVisible();
    await page.getByTestId('dados-tabela-veiculos').click();
    await expect(page.getByTestId('dados-tabela')).toContainText(base);

    // Novo registro
    const placa = placa7();
    await page.getByTestId('dados-novo').click();
    const form = page.getByTestId('dados-form');
    await form.locator('#campo-placa').fill(placa);
    await form.locator('#campo-tipo').fill('CAVALO');
    await form.locator('#campo-marca').fill('SCANIA');
    await page.getByTestId('dados-salvar').click();
    await expect(page.getByTestId('dados-aviso')).toHaveText('Registro criado');

    // Busca + edição
    await page.getByTestId('dados-busca').fill(placa);
    await page.getByTestId('dados-busca').press('Enter');
    const linha = page.getByTestId('dados-tabela').locator('tr', { hasText: placa });
    await expect(linha).toBeVisible();
    await linha.getByTestId('dados-editar').click();
    await page.getByTestId('dados-form').locator('#campo-marca').fill('VOLVO');
    await page.getByTestId('dados-salvar').click();
    await expect(page.getByTestId('dados-aviso')).toHaveText('Registro atualizado');
    await expect(page.getByTestId('dados-tabela').locator('tr', { hasText: placa })).toContainText('VOLVO');

    // Lixeira -> restaurar -> apagar de vez
    page.on('dialog', (d) => void d.accept());
    await page.getByTestId('dados-tabela').locator('tr', { hasText: placa }).getByTestId('dados-excluir').click();
    await expect(page.getByTestId('dados-aviso')).toHaveText('Registro enviado para a lixeira');
    await expect(page.getByTestId('dados-tabela').locator('tr', { hasText: placa })).toHaveCount(0);
    await page.getByTestId('dados-lixeira').check();
    const naLixeira = page.getByTestId('dados-tabela').locator('tr', { hasText: placa });
    await expect(naLixeira).toBeVisible();
    await naLixeira.getByRole('button', { name: 'Restaurar' }).click();
    await expect(page.getByTestId('dados-aviso')).toHaveText('Registro restaurado');
    await page.getByTestId('dados-lixeira').uncheck();
    await page.getByTestId('dados-tabela').locator('tr', { hasText: placa }).getByTestId('dados-apagar').click();
    await expect(page.getByTestId('dados-aviso')).toHaveText('Registro apagado');
    await expect(page.getByTestId('dados-tabela').locator('tr', { hasText: placa })).toHaveCount(0);
  });

  test('ADMIN não acessa o gerenciador (API responde 403)', async ({ request }) => {
    const token = await apiLogin(request, 'ADMIN');
    const res = await request.get(`${API_BASE_URL}/admin/dados`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(403);
    const apagar = await request.delete(`${API_BASE_URL}/admin/dados/veiculos/qualquer`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(apagar.status()).toBe(403);
  });

  test('SUPERADMIN exclui viagem e motorista pelas próprias telas', async ({ page, request }) => {
    const token = await apiLogin(request, 'SUPERADMIN');
    const auth = { Authorization: `Bearer ${token}` };
    const placa = placa7();
    expect((await request.post(`${API_BASE_URL}/veiculos`, { headers: auth, data: { placa, tipo: 'CAVALO' } })).ok()).toBeTruthy();
    const suf = Date.now().toString().slice(-9);
    const mot = await request.post(`${API_BASE_URL}/motoristas`, {
      headers: auth,
      data: { nome_completo: `Motorista Excluir ${suf}`, cpf: `${suf}-00`, cnh: suf, cnh_categoria: 'E', cnh_validade: '2030-01-01' },
    });
    expect(mot.ok(), await mot.text()).toBeTruthy();
    const motoristaId = ((await mot.json()) as { id: string }).id;
    const via = await request.post(`${API_BASE_URL}/viagens`, {
      headers: auth,
      data: { placa_cavalo: placa, motorista_id: motoristaId, origem: 'Uruguaiana/RS', destino: 'Buenos Aires/AR', data_programacao: new Date().toISOString() },
    });
    expect(via.ok(), await via.text()).toBeTruthy();
    const viagemId = ((await via.json()) as { id: string }).id;

    await loginAs(page, 'SUPERADMIN');
    page.on('dialog', (d) => void d.accept());
    await page.goto(`/viagens/${viagemId}`);
    await page.getByTestId('viagem-excluir').click();
    await expect(page).toHaveURL(/\/viagens$/);
    expect((await request.get(`${API_BASE_URL}/viagens/${viagemId}`, { headers: auth })).status()).toBe(404);

    await page.goto(`/motoristas/${motoristaId}`);
    await page.getByTestId('mf-excluir').click();
    await expect(page).toHaveURL(/\/motoristas$/);
    expect((await request.get(`${API_BASE_URL}/motoristas/${motoristaId}`, { headers: auth })).status()).toBe(404);
  });
});
