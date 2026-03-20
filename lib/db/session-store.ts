import { type SessionState } from "@/lib/types";
import { getStorage } from "@/lib/db/storage";

export async function createSession(data: {
  workspaceId: string;
  formId: string;
  versionNumber: number;
  currentQuestionId: string | null;
}) {
  return (await getStorage()).sessions.createSession(data);
}

export async function getSession(sessionToken: string): Promise<SessionState | null> {
  return (await getStorage()).sessions.getSession(sessionToken);
}

export async function getSessionByResumeToken(resumeToken: string): Promise<SessionState | null> {
  return (await getStorage()).sessions.getSessionByResumeToken(resumeToken);
}

export async function updateSessionState(data: {
  sessionToken: string;
  currentQuestionId: string | null;
  answersJson: string;
  historyJson: string;
  branchTraceJson: string;
}) {
  return (await getStorage()).sessions.updateSessionState(data);
}

export async function markSessionCompleted(sessionToken: string) {
  return (await getStorage()).sessions.markSessionCompleted(sessionToken);
}

export async function isSessionExpired(session: Pick<SessionState, "expiresAt">) {
  return (await getStorage()).sessions.isSessionExpired(session);
}
