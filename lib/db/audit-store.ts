import { getStorage, type AuditEventPayload } from "@/lib/db/storage";

export async function writeAuditEvent(
  workspaceId: string,
  actor: string,
  eventType: string,
  payload: AuditEventPayload
) {
  return (await getStorage()).audit.writeEvent(workspaceId, actor, eventType, payload);
}
