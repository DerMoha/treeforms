import { type PoolConnection } from "mysql2/promise";

import {
  type DbTargetConfig,
  type DbTargetInput,
  type DraftRecord,
  type FormRecord,
  type FormSchema,
  type FormVersionRecord,
  type SessionState
} from "@/lib/types";

export interface CreateSessionData {
  workspaceId: string;
  formId: string;
  versionNumber: number;
  currentQuestionId: string | null;
}

export interface SessionTokens {
  sessionToken: string;
  resumeToken: string;
  expiresAt: string;
}

export interface UpdateSessionData {
  sessionToken: string;
  currentQuestionId: string | null;
  answersJson: string;
  historyJson: string;
  branchTraceJson: string;
}

export interface WorkspaceData {
  id: string;
  name: string;
  createdAt: string;
}

export interface AuditEventPayload {
  formId?: string;
  title?: string;
  version?: number;
  targetId?: string;
  name?: string;
  host?: string;
  databaseName?: string;
}

export interface FormStorage {
  initializeWorkspace(workspaceId: string): Promise<void>;
  createForm(workspaceId: string, title: string): Promise<{ formId: string; slug: string; title: string }>;
  listForms(workspaceId: string): Promise<FormRecord[]>;
  getFormById(formId: string): Promise<FormRecord | null>;
  getDraft(formId: string): Promise<DraftRecord | null>;
  updateDraft(formId: string, schema: FormSchema, actor: string): Promise<{ ok: boolean; errors: string[] }>;
  listVersions(formId: string): Promise<FormVersionRecord[]>;
  getVersionByFormAndNumber(formId: string, versionNumber: number): Promise<FormVersionRecord | null>;
  getPublishedBySlug(slug: string, version: number): Promise<{
    formId: string;
    workspaceId: string;
    slug: string;
    title: string;
    versionId: string;
    versionNumber: number;
    schemaJson: string;
  } | null>;
  publishDraft(formId: string, actor: string): Promise<
    | { ok: true; versionNumber: number; versionId: string }
    | { ok: false; status: number; error: string; errors?: string[] }
  >;
}

export interface SessionStorage {
  createSession(data: CreateSessionData): Promise<SessionTokens>;
  getSession(sessionToken: string): Promise<SessionState | null>;
  getSessionByResumeToken(resumeToken: string): Promise<SessionState | null>;
  updateSessionState(data: UpdateSessionData): Promise<void>;
  markSessionCompleted(sessionToken: string): Promise<void>;
  isSessionExpired(session: Pick<SessionState, "expiresAt">): boolean;
}

export interface DbTargetStorage {
  testDbTarget(input: DbTargetInput): Promise<{ ok: boolean }>;
  setActiveDbTarget(workspaceId: string, input: DbTargetInput): Promise<{ targetId: string }>;
  getActiveDbTarget(workspaceId: string): Promise<DbTargetConfig | null>;
}

export interface AuditStorage {
  writeEvent(
    workspaceId: string,
    actor: string,
    eventType: string,
    payload: AuditEventPayload,
    connection?: PoolConnection
  ): Promise<void>;
}

export interface PlatformSettingsStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, encrypt: boolean): Promise<void>;
}

export interface Storage {
  forms: FormStorage;
  sessions: SessionStorage;
  dbTargets: DbTargetStorage;
  audit: AuditStorage;
  platformSettings: PlatformSettingsStorage;
  workspaces: WorkspaceStorage;
}

export interface WorkspaceStorage {
  get(workspaceId: string): Promise<WorkspaceData | null>;
  set(workspaceId: string, data: WorkspaceData): Promise<void>;
}