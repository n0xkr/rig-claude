import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ENTIDADES_CAMPO_PERSONALIZADO } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { isSchemaAusente } from '../../lib/permissoes.js';
import { authenticate } from '../../middleware/auth.js';
import { parseOrProblem } from '../../middleware/validate.js';

const Query = z.object({ entidade: z.enum(ENTIDADES_CAMPO_PERSONALIZADO).optional() });

/**
 * Catálogo dos campos criados a partir de colunas novas das planilhas (migration 0015): as telas
 * usam para dar nome e tipo (hora, data, número...) aos valores de `dados_extras`. Leitura para
 * qualquer usuário logado; a criação acontece na importação. Sem a migration devolve lista vazia.
 */
export async function camposPersonalizadosRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);

  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const q = parseOrProblem(Query, request.query, reply);
    if (!q) return;
    let query = supabaseAdmin
      .from('campos_personalizados')
      .select('entidade, chave, rotulo, tipo, exemplo')
      .order('entidade')
      .order('rotulo')
      .limit(5000);
    if (q.entidade) query = query.eq('entidade', q.entidade);
    const { data, error } = await query;
    if (error) {
      if (isSchemaAusente(error)) return reply.send({ data: [], catalogo_disponivel: false });
      throw error;
    }
    return reply.send({ data: data ?? [], catalogo_disponivel: true });
  });
}
