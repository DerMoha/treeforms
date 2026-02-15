import { type SessionState } from "@/lib/types";
import { getStorage } from "@/lib/db/storage";

export async function createSession(data: {
  workspaceId: string;
  formId: string;
  versionNumber: number;
  currentQuestionId: string | null;
}) {
  return getStorage().sessions.createSession(data);
}

export async function getSession(sessionToken: string): Promise<SessionState | null> {
  return getStorage().sessions.getSession(sessionToken);
}

export async function getSessionByResumeToken(resumeToken: string): Promise<SessionState | null> {
  return getStorage().sessions.getSessionByResumeToken(resumeToken);
}

export async function updateSessionState(data: {
  sessionToken: string;
  currentQuestionId: string | null;
  answersJson: string;
  historyJson: string;
  branchTraceJson: string;
}) {
  return getStorage().sessions.updateSessionState(data);
}

export async function markSessionCompleted(sessionToken: string) {
  return getStorage().sessions.markSessionCompleted(sessionToken);
}

export function isSessionExpired(session: Pick<SessionState, "expiresAt">) {
  return getStorage().sessions.isSessionExpired(session);
}
