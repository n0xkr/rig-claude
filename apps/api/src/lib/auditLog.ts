import { supabaseAdmin } from "../config/supabase.js";
import { logger } from "../config/logger.js";

export interface AuditLogEntry {
  userId: string | null;
  action: "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE";
  entity: string;
  entityId: string | null;
  changes: Record<string, unknown> | null;
  ip: string | null;
}

/**
 * Grava uma entrada na trilha de auditoria (critério #3). Falhas ao gravar o
 * log NÃO devem derrubar a operação de negócio principal — apenas registram
 * um erro no logger estruturado.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    user_id: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId,
    changes_json: entry.changes,
    ip: entry.ip,
  });
  if (error) {
    logger.error({ err: error, entry }, "Falha ao gravar audit_log");
  }
}
