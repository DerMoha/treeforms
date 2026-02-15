import { type PoolConnection } from "mysql2/promise";
import { getStorage, type AuditEventPayload } from "@/lib/db/storage";

export async function writeAuditEvent(
  workspaceId: string,
  actor: string,
  eventType: string,
  payload: AuditEventPayload,
  connection?: PoolConnection
) {
  return getStorage().audit.writeEvent(workspaceId, actor, eventType, payload, connection);
}
