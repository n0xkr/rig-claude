import { test, expect } from '@playwright/test';
import { loginAs, apiLogin, API_BASE_URL, randomPlaca } from './helpers.js';

/**
 * Módulo 6 — Integração TMS+WMS. Pré-requisito honesto: não existe NENHUM
 * controle na UI para vincular uma expedição a uma viagem (nem no formulário
 * de criação da expedição, nem no detalhe) — só a API tem esse campo
 * (`viagem_id` em `POST /wms/expedicoes`/`PATCH .../vincular-viagem`). O
 * vínculo é criado aqui via API; a asserção real do teste é 100% via
 * navegador (a seção "Integração com o armazém (WMS)" de
 * `ViagemDetailPage`).
 */
test('a seção WMS da viagem mostra a expedição vinculada a ela', async ({ page, request }) => {
  const token = await apiLogin(request, 'OPERADOR');

  const viagemRes = await request.post(`${API_BASE_URL}/viagens`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { placa_cavalo: randomPlaca(), origem: 'Uruguaiana/RS', destino: 'Encarnación/PY' },
  });
  expect(viagemRes.ok()).toBeTruthy();
  const viagem = (await viagemRes.json()) as { id: string };

  const depRes = await request.post(`${API_BASE_URL}/wms/depositantes`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { razao_social: 'Depositante Módulo 6', cnpj_cpf: '99.888.777/0001-11' },
  });
  const depositante = (await depRes.json()) as { id: string };

  const prodRes = await request.post(`${API_BASE_URL}/wms/produtos`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { depositante_id: depositante.id, sku: `SKU-M6-${Date.now()}`, descricao: 'Item M6' },
  });
  const produto = (await prodRes.json()) as { id: string };

  const expRes = await request.post(`${API_BASE_URL}/wms/expedicoes`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      depositante_id: depositante.id,
      viagem_id: viagem.id,
      itens: [{ produto_id: produto.id, quantidade_solicitada: 5 }],
    },
  });
  expect(expRes.ok(), await expRes.text()).toBeTruthy();
  const expedicao = (await expRes.json()) as { id: string };

  await loginAs(page, 'OPERADOR');
  await page.goto(`/viagens/${viagem.id}`);

  await expect(page.getByText('Expedição vinculada')).toBeVisible();
  await page.getByText('Expedição vinculada').click();
  await expect(page).toHaveURL(new RegExp(`/wms/expedicoes/${expedicao.id}`));
  await expect(page.getByText('Viagem vinculada (Módulo 6', { exact: false })).toBeVisible();
});
