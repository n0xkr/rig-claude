import type { AuditLog } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';

const TABLE = 'audit_logs';

export interface ListAuditLogsFilter {
  entity?: string;
  entityId?: string;
  userId?: string;
  cursor?: string;
  limit: number;
}

/** Leitura da trilha de auditoria (critério #21) — escrita é feita exclusivamente por `writeAuditLog`, já usado por todos os módulos. */
export class AuditoriaRepository {
  async list(
    filter: ListAuditLogsFilter,
  ): Promise<{ data: AuditLog[]; nextCursor: string | null }> {
    let query = supabaseAdmin
      .from(TABLE)
      .select('*, user:profiles(nome_completo, email)')
      .order('id', { ascending: false })
      .limit(filter.limit + 1);

    if (filter.entity) query = query.eq('entity', filter.entity);
    if (filter.entityId) query = query.eq('entity_id', filter.entityId);
    if (filter.userId) query = query.eq('user_id', filter.userId);
    if (filter.cursor) query = query.lt('id', filter.cursor);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as AuditLog[];
    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1]!.id : null;
    return { data: page, nextCursor };
  }
}
