import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { resolverPermissoes, temModulo } from '@rigabras/shared';

// Banco em memória (config/fakeSupabase.ts): definido ANTES de importar o app,
// pois `config/env.ts` e `config/supabase.ts` leem o ambiente no import.
process.env.USE_FAKE_DB = 'true';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';

const SENHA_SEED = 'Teste@123';
let app: FastifyInstance;

async function login(email: string, password = SENHA_SEED): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as { accessToken: string }).accessToken;
}

function chamar(
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
  });
}

function decode(token: string): { role: string; mods?: string[] | null } {
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf-8'));
}

beforeAll(async () => {
  const { buildApp } = await import('../../app.js');
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app?.close();
});

describe('resolverPermissoes', () => {
  it('SUPERADMIN sempre sem restrição', () => {
    expect(resolverPermissoes('SUPERADMIN', ['wms'], ['viagens'])).toBeNull();
  });
  it('lista do usuário vence a da categoria; ambas nulas = todos', () => {
    expect(resolverPermissoes('OPERADOR', ['wms'], ['viagens'])).toEqual(['wms']);
    expect(resolverPermissoes('OPERADOR', null, ['viagens'])).toEqual(['viagens']);
    expect(resolverPermissoes('OPERADOR', null, null)).toBeNull();
    expect(resolverPermissoes('OPERADOR', ['viagens', 'inexistente'], null)).toEqual(['viagens']);
  });
  it('temModulo', () => {
    expect(temModulo(null, 'wms')).toBe(true);
    expect(temModulo([], 'wms')).toBe(false);
    expect(temModulo(['wms'], 'wms')).toBe(true);
  });
});

describe('Usuários, categorias e permissões (API + banco fake)', () => {
  it('SUPERADMIN cria categoria, cria/edita/exclui usuário e as permissões valem na API', async () => {
    const admin = await login('superadmin@rigabras.test');

    // Categoria
    const cat = await chamar(admin, 'POST', '/categorias-usuario', {
      nome: 'Portaria noturna',
      descricao: 'Só portaria e viagens',
      permissoes: ['portaria', 'viagens', 'viagens'],
    });
    expect(cat.statusCode, cat.body).toBe(201);
    const categoria = cat.json() as { id: string; permissoes: string[] };
    expect(categoria.permissoes).toEqual(['portaria', 'viagens']);

    const invalida = await chamar(admin, 'POST', '/categorias-usuario', {
      nome: 'X',
      permissoes: ['modulo_que_nao_existe'],
    });
    expect(invalida.statusCode).toBe(422);

    // Usuário na categoria
    const criado = await chamar(admin, 'POST', '/usuarios', {
      nome_completo: 'Teste Categoria',
      email: 'categoria@rigabras.test',
      password: 'SenhaForte123',
      role: 'OPERADOR',
      categoria_id: categoria.id,
    });
    expect(criado.statusCode, criado.body).toBe(201);
    const usuario = criado.json() as { id: string; categoria_id: string; permissoes: null };
    expect(usuario.categoria_id).toBe(categoria.id);
    expect(usuario.permissoes).toBeNull();

    const duplicado = await chamar(admin, 'POST', '/usuarios', {
      nome_completo: 'Duplicado',
      email: 'categoria@rigabras.test',
      password: 'SenhaForte123',
      role: 'OPERADOR',
    });
    expect(duplicado.statusCode).toBe(409);

    const lista = await chamar(admin, 'GET', '/categorias-usuario');
    expect(lista.statusCode).toBe(200);
    const cats = (lista.json() as { data: Array<{ id: string; total_usuarios: number }> }).data;
    expect(cats.find((c) => c.id === categoria.id)?.total_usuarios).toBe(1);

    // Token do usuário carrega os módulos da categoria e a API os aplica
    let token = await login('categoria@rigabras.test', 'SenhaForte123');
    expect(decode(token).mods).toEqual(['portaria', 'viagens']);
    expect((await chamar(token, 'GET', '/viagens')).statusCode).toBe(200);
    expect((await chamar(token, 'GET', '/portaria/entradas')).statusCode).not.toBe(403);
    // Viagens pode LER o WMS (tela da viagem mostra o status no armazém), mas não escrever
    expect((await chamar(token, 'GET', '/wms/kpis')).statusCode).not.toBe(403);
    expect((await chamar(token, 'POST', '/wms/depositantes', {})).statusCode).toBe(403);
    const bloqueado = await chamar(token, 'GET', '/frota/kpis');
    expect(bloqueado.statusCode).toBe(403);
    expect((bloqueado.json() as { detail: string }).detail).toMatch(/Frota/);
    // Veículos: leitura livre, escrita exige Acompanhamento ou Frota
    expect((await chamar(token, 'GET', '/veiculos')).statusCode).toBe(200);
    expect(
      (await chamar(token, 'POST', '/veiculos', { placa: 'ABC1D23', tipo: 'CAVALO' })).statusCode,
    ).toBe(403);

    // Permissões próprias do usuário vencem a categoria
    const editado = await chamar(admin, 'PATCH', `/usuarios/${usuario.id}`, {
      nome_completo: 'Teste Editado',
      permissoes: ['wms'],
    });
    expect(editado.statusCode, editado.body).toBe(200);
    expect((editado.json() as { nome_completo: string }).nome_completo).toBe('Teste Editado');
    token = await login('categoria@rigabras.test', 'SenhaForte123');
    expect(decode(token).mods).toEqual(['wms']);
    expect((await chamar(token, 'GET', '/wms/kpis')).statusCode).not.toBe(403);
    expect((await chamar(token, 'GET', '/fretes')).statusCode).toBe(403);

    // Campo desconhecido é rejeitado (schema strict)
    expect(
      (await chamar(admin, 'PATCH', `/usuarios/${usuario.id}`, { email: 'x@y.com' })).statusCode,
    ).toBe(422);

    // Troca de senha
    const senha = await chamar(admin, 'PATCH', `/usuarios/${usuario.id}`, {
      password: 'OutraSenha456',
    });
    expect(senha.statusCode, senha.body).toBe(200);
    await login('categoria@rigabras.test', 'OutraSenha456');

    // Excluir categoria desvincula o usuário
    expect((await chamar(admin, 'DELETE', `/categorias-usuario/${categoria.id}`)).statusCode).toBe(
      204,
    );
    const usuarios = (await chamar(admin, 'GET', '/usuarios')).json() as {
      data: Array<{ id: string; categoria_id: string | null }>;
    };
    expect(usuarios.data.find((u) => u.id === usuario.id)?.categoria_id).toBeNull();

    // Não-SUPERADMIN não gerencia usuários nem categorias
    const operador = await login('operador@rigabras.test');
    expect((await chamar(operador, 'GET', '/usuarios')).statusCode).toBe(403);
    expect((await chamar(operador, 'GET', '/categorias-usuario')).statusCode).toBe(403);
    // Sem categoria = sem restrição de módulo (comportamento anterior)
    expect(decode(operador).mods).toBeNull();
    expect((await chamar(operador, 'GET', '/wms/kpis')).statusCode).not.toBe(403);

    // Exclusão
    const excluido = await chamar(admin, 'DELETE', `/usuarios/${usuario.id}`);
    expect(excluido.statusCode, excluido.body).toBe(200);
    expect((excluido.json() as { modo: string }).modo).toBe('definitiva');
    const depois = (await chamar(admin, 'GET', '/usuarios')).json() as {
      data: Array<{ id: string }>;
    };
    expect(depois.data.some((u) => u.id === usuario.id)).toBe(false);

    // Não pode excluir a si mesmo
    const eu = decode(admin) as unknown as { sub: string };
    expect((await chamar(admin, 'DELETE', `/usuarios/${eu.sub}`)).statusCode).toBe(422);
  });
});
