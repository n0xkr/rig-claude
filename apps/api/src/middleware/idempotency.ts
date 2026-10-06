import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../config/supabase.js';
import { isSchemaAusente } from '../lib/permissoes.js';

declare module 'fastify' {
  interface FastifyRequest {
    idempotencyKey?: string;
  }
}

const UUID_OU_TOKEN = /^[A-Za-z0-9._:-]{8,128}$/;
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Idempotência de mutações (POST/PATCH/PUT com `Idempotency-Key`): a primeira requisição
 * reserva a chave; reenvios (ex.: fila offline após falha de rede) recebem a resposta
 * original em vez de executar de novo. Chave em andamento → 409. Sem a tabela
 * (migration 0017 pendente) o recurso é desativado silenciosamente.
 */
export function registerIdempotency(app: FastifyInstance): void {
  let disponivel = true;

  app.addHook('preHandler', async (request, reply) => {
    const key = request.headers['idempotency-key'];
    if (!disponivel || typeof key !== 'string' || !UUID_OU_TOKEN.test(key)) return;
    if (request.method !== 'POST' && request.method !== 'PATCH' && request.method !== 'PUT')
      return;
    const userId = request.user?.sub;
    if (!userId) return;

    const { error } = await supabaseAdmin.from('idempotency_keys').insert({
      key,
      user_id: userId,
      method: request.method,
      path: request.url.split('?')[0],
    });
    if (!error) {
      request.idempotencyKey = key;
      return;
    }
    if (isSchemaAusente(error)) {
      disponivel = false;
      return;
    }
    if (error.code !== '23505') return;

    const { data } = await supabaseAdmin
      .from('idempotency_keys')
      .select('status_code, response, created_at')
      .eq('user_id', userId)
      .eq('key', key)
      .maybeSingle();
    if (data?.status_code != null) {
      reply.header('Idempotent-Replay', 'true');
      return reply.status(data.status_code).send(data.response ?? undefined);
    }
    if (data && Date.now() - new Date(data.created_at).getTime() > TTL_MS) {
      await supabaseAdmin.from('idempotency_keys').delete().eq('user_id', userId).eq('key', key);
    }
    return reply.status(409).send({
      type: 'about:blank',
      title: 'Requisição em andamento',
      status: 409,
      detail: 'Uma requisição com esta Idempotency-Key ainda está sendo processada',
    });
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const key = request.idempotencyKey;
    const userId = request.user?.sub;
    if (!key || !userId) return payload;
    if (reply.statusCode >= 500) {
      // falha transitória: libera a chave para nova tentativa
      await supabaseAdmin.from('idempotency_keys').delete().eq('user_id', userId).eq('key', key);
      return payload;
    }
    let response: unknown;
    try {
      response = typeof payload === 'string' && payload ? JSON.parse(payload) : null;
    } catch {
      response = null;
    }
    await supabaseAdmin
      .from('idempotency_keys')
      .update({ status_code: reply.statusCode, response })
      .eq('user_id', userId)
      .eq('key', key);
    return payload;
  });
}
