import { makeId, slugify } from "@/lib/ids";
import { createEmptySchema, validateSchema } from "@/lib/schema";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import { DEFAULT_WORKSPACE_NAME, RESPONDENT_SESSION_TTL_SECONDS } from "@/lib/server/constants";
import { readLocalJson, writeLocalJson } from "@/lib/db/local-sqlite";
import {
  type FormStorage,
  type SessionStorage,
  type DbTargetStorage,
  type AuditStorage,
  type PlatformSettingsStorage,
  type WorkspaceStorage,
  type Storage,
  type CreateSessionData,
  type SessionTokens,
  type UpdateSessionData,
  type WorkspaceData,
  type AuditEventPayload
} from "./interface";
import {
  type DbTargetConfig,
  type DbTargetInput,
  type DraftRecord,
  type FormRecord,
  type FormSchema,
  type FormVersionRecord,
  type SessionState
} from "@/lib/types";

const APP_STORE_STATE_KEY = "treeforms.app-store.v1";
const PLATFORM_SETTINGS_KEY = "treeforms.platform-settings.v1";

interface MemoryAuditEvent {
  id: string;
  workspaceId: string;
  actor: string;
  eventType: string;
  payloadJson: string;
  createdAt: string;
}

interface MemoryState {
  workspaces: Map<string, WorkspaceData>;
  forms: Map<string, FormRecord>;
  drafts: Map<string, DraftRecord>;
  versions: Map<string, FormVersionRecord[]>;
  sessions: Map<string, SessionState>;
  sessionByResumeToken: Map<string, string>;
  dbTargets: Map<string, DbTargetConfig[]>;
  auditEvents: MemoryAuditEvent[];
}

interface SerializedMemoryState {
  workspaces: Array<[string, WorkspaceData]>;
  forms: Array<[string, FormRecord]>;
  drafts: Array<[string, DraftRecord]>;
  versions: Array<[string, FormVersionRecord[]]>;
  sessions: Array<[string, SessionState]>;
  sessionByResumeToken: Array<[string, string]>;
  dbTargets: Array<[string, DbTargetConfig[]]>;
  auditEvents: MemoryAuditEvent[];
}

declare global {
  // eslint-disable-next-line no-var
  var __TREEFORMS_MEMORY_STATE: MemoryState | undefined;
}

const memoryState: MemoryState =
  globalThis.__TREEFORMS_MEMORY_STATE ?? {
    workspaces: new Map(),
    forms: new Map(),
    drafts: new Map(),
    versions: new Map(),
    sessions: new Map(),
    sessionByResumeToken: new Map(),
    dbTargets: new Map(),
    auditEvents: []
  };

globalThis.__TREEFORMS_MEMORY_STATE = memoryState;

hydrateMemoryStateFromDisk();

function nowIso(): string {
  return new Date().toISOString();
}

function cloneRecord<T>(record: T): T {
  return structuredClone(record);
}

function uniqueSlug(workspaceId: string, baseSlug: string): string {
  const inWorkspace = Array.from(memoryState.forms.values()).filter(
    (form) => form.workspaceId === workspaceId
  );

  const existing = new Set(inWorkspace.map((form) => form.slug));

  if (!existing.has(baseSlug)) {
    return baseSlug;
  }

  let counter = 2;
  let next = `${baseSlug}-${counter}`;

  while (existing.has(next)) {
    counter += 1;
    next = `${baseSlug}-${counter}`;
  }

  return next;
}

function computeRespondentSessionExpiry(createdAtIso: string): string {
  return new Date(Date.parse(createdAtIso) + RESPONDENT_SESSION_TTL_SECONDS * 1000).toISOString();
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function persistMemoryStateToDisk(): void {
  writeLocalJson(APP_STORE_STATE_KEY, serializeMemoryState());
}

function serializeMemoryState(): SerializedMemoryState {
  return {
    workspaces: Array.from(memoryState.workspaces.entries()),
    forms: Array.from(memoryState.forms.entries()),
    drafts: Array.from(memoryState.drafts.entries()),
    versions: Array.from(memoryState.versions.entries()),
    sessions: Array.from(memoryState.sessions.entries()),
    sessionByResumeToken: Array.from(memoryState.sessionByResumeToken.entries()),
    dbTargets: Array.from(memoryState.dbTargets.entries()),
    auditEvents: [...memoryState.auditEvents]
  };
}

function hydrateMemoryStateFromDisk(): void {
  const stored = readLocalJson<Partial<SerializedMemoryState>>(APP_STORE_STATE_KEY);
  if (!stored) {
    return;
  }

  try {
    memoryState.workspaces = new Map(stored.workspaces ?? []);
    memoryState.forms = new Map(stored.forms ?? []);
    memoryState.drafts = new Map(stored.drafts ?? []);
    memoryState.versions = new Map(stored.versions ?? []);
    memoryState.sessions = new Map(
      (stored.sessions ?? []).map(([sessionToken, session]) => {
        const normalized: SessionState = {
          ...session,
          expiresAt:
            typeof session.expiresAt === "string"
              ? session.expiresAt
              : computeRespondentSessionExpiry(session.createdAt)
        };
        return [sessionToken, normalized];
      })
    );
    memoryState.sessionByResumeToken = new Map(stored.sessionByResumeToken ?? []);
    memoryState.dbTargets = new Map(stored.dbTargets ?? []);
    memoryState.auditEvents = Array.isArray(stored.auditEvents) ? stored.auditEvents : [];
  } catch {
    // Keep defaults if persisted data is malformed.
  }
}

class MemoryFormStorage implements FormStorage {
  async initializeWorkspace(workspaceId: string): Promise<void> {
    const existing = memoryState.workspaces.get(workspaceId);

    if (!existing) {
      memoryState.workspaces.set(workspaceId, {
        id: workspaceId,
        name: DEFAULT_WORKSPACE_NAME,
        createdAt: nowIso()
      });
      persistMemoryStateToDisk();
    }
  }

  async createForm(workspaceId: string, title: string): Promise<{ formId: string; slug: string; title: string }> {
    await this.initializeWorkspace(workspaceId);

    const formId = makeId("form");
    const slug = uniqueSlug(workspaceId, slugify(title));
    const createdAt = nowIso();

    const form: FormRecord = {
      formId,
      workspaceId,
      slug,
      title,
      createdAt,
      updatedAt: createdAt
    };

    memoryState.forms.set(formId, form);

    const schema = createEmptySchema(formId, title);

    memoryState.drafts.set(formId, {
      formId,
      schemaJson: JSON.stringify(schema),
      updatedAt: createdAt
    });

    return {
      formId,
      slug,
      title
    };
  }

  async listForms(workspaceId: string): Promise<FormRecord[]> {
    await this.initializeWorkspace(workspaceId);

    return Array.from(memoryState.forms.values())
      .filter((form) => form.workspaceId === workspaceId)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .map(cloneRecord);
  }

  async getFormById(formId: string): Promise<FormRecord | null> {
    const record = memoryState.forms.get(formId);
    return record ? cloneRecord(record) : null;
  }

  async getDraft(formId: string): Promise<DraftRecord | null> {
    const draft = memoryState.drafts.get(formId);
    return draft ? cloneRecord(draft) : null;
  }

  async updateDraft(formId: string, schema: FormSchema, actor: string): Promise<{ ok: boolean; errors: string[] }> {
    const validation = validateSchema(schema, {
      enforceGlobalQuestionIdUniqueness: true
    });
    if (!validation.valid) {
      return {
        ok: false,
        errors: validation.errors
      };
    }

    const form = memoryState.forms.get(formId);

    if (!form) {
      return {
        ok: false,
        errors: ["Form not found"]
      };
    }

    const now = nowIso();

    memoryState.drafts.set(formId, {
      formId,
      schemaJson: JSON.stringify(schema),
      updatedAt: now
    });

    form.title = schema.title;
    form.updatedAt = now;
    memoryState.forms.set(formId, form);

    return {
      ok: true,
      errors: []
    };
  }

  async listVersions(formId: string): Promise<FormVersionRecord[]> {
    return [...(memoryState.versions.get(formId) ?? [])]
      .sort((a, b) => b.versionNumber - a.versionNumber)
      .map(cloneRecord);
  }

  async getVersionByFormAndNumber(formId: string, versionNumber: number): Promise<FormVersionRecord | null> {
    const version = (memoryState.versions.get(formId) ?? []).find(
      (entry) => entry.versionNumber === versionNumber
    );

    return version ? cloneRecord(version) : null;
  }

  async getPublishedBySlug(slug: string, version: number): Promise<{
    formId: string;
    workspaceId: string;
    slug: string;
    title: string;
    versionId: string;
    versionNumber: number;
    schemaJson: string;
  } | null> {
    const form = Array.from(memoryState.forms.values()).find((entry) => entry.slug === slug);

    if (!form) {
      return null;
    }

    const versionRecord = (memoryState.versions.get(form.formId) ?? []).find(
      (entry) => entry.versionNumber === version
    );

    if (!versionRecord) {
      return null;
    }

    return {
      formId: form.formId,
      workspaceId: form.workspaceId,
      slug: form.slug,
      title: form.title,
      versionId: versionRecord.id,
      versionNumber: versionRecord.versionNumber,
      schemaJson: versionRecord.schemaJson
    };
  }

  async publishDraft(formId: string, _actor: string): Promise<
    | { ok: true; versionNumber: number; versionId: string }
    | { ok: false; status: number; error: string; errors?: string[] }
  > {
    const form = memoryState.forms.get(formId);
    if (!form) {
      return {
        ok: false,
        status: 404,
        error: "Form not found"
      };
    }

    const draft = memoryState.drafts.get(formId);
    if (!draft) {
      return {
        ok: false,
        status: 400,
        error: "Draft not found"
      };
    }

    const schema = JSON.parse(draft.schemaJson) as FormSchema;
    const validation = validateSchema(schema, {
      enforceGlobalQuestionIdUniqueness: true
    });

    if (!validation.valid) {
      return {
        ok: false,
        status: 422,
        error: "Draft validation failed",
        errors: validation.errors
      };
    }

    const versions = memoryState.versions.get(formId) ?? [];
    const nextVersion = (versions[0]?.versionNumber ?? 0) + 1;
    const versionRecord: FormVersionRecord = {
      id: makeId("ver"),
      formId,
      versionNumber: nextVersion,
      schemaJson: draft.schemaJson,
      publishedAt: nowIso()
    };

    memoryState.versions.set(formId, [versionRecord, ...versions]);

    return {
      ok: true,
      versionNumber: nextVersion,
      versionId: versionRecord.id
    };
  }
}

class MemorySessionStorage implements SessionStorage {
  async createSession(data: CreateSessionData): Promise<SessionTokens> {
    const sessionToken = crypto.randomUUID().replace(/-/g, "");
    const resumeToken = crypto.randomUUID().replace(/-/g, "");
    const createdAt = nowIso();
    const expiresAt = computeRespondentSessionExpiry(createdAt);

    const session: SessionState = {
      sessionToken,
      resumeToken,
      workspaceId: data.workspaceId,
      formId: data.formId,
      versionNumber: data.versionNumber,
      status: "in_progress",
      currentQuestionId: data.currentQuestionId,
      answers: {},
      history: data.currentQuestionId ? [data.currentQuestionId] : [],
      branchTrace: [],
      expiresAt,
      createdAt,
      updatedAt: createdAt
    };

    memoryState.sessions.set(sessionToken, session);
    memoryState.sessionByResumeToken.set(resumeToken, sessionToken);
    persistMemoryStateToDisk();

    return {
      sessionToken,
      resumeToken,
      expiresAt
    };
  }

  async getSession(sessionToken: string): Promise<SessionState | null> {
    const session = memoryState.sessions.get(sessionToken);
    return session ? cloneRecord(session) : null;
  }

  async getSessionByResumeToken(resumeToken: string): Promise<SessionState | null> {
    const sessionToken = memoryState.sessionByResumeToken.get(resumeToken);
    if (!sessionToken) {
      return null;
    }

    const session = memoryState.sessions.get(sessionToken);
    return session ? cloneRecord(session) : null;
  }

  async updateSessionState(data: UpdateSessionData): Promise<void> {
    const existing = memoryState.sessions.get(data.sessionToken);
    if (!existing) {
      return;
    }

    const updated: SessionState = {
      ...existing,
      currentQuestionId: data.currentQuestionId,
      answers: safeJson(data.answersJson, existing.answers),
      history: safeJson(data.historyJson, existing.history),
      branchTrace: safeJson(data.branchTraceJson, existing.branchTrace),
      updatedAt: nowIso()
    };

    memoryState.sessions.set(data.sessionToken, updated);
    persistMemoryStateToDisk();
  }

  async markSessionCompleted(sessionToken: string): Promise<void> {
    const existing = memoryState.sessions.get(sessionToken);

    if (!existing) {
      return;
    }

    memoryState.sessions.set(sessionToken, {
      ...existing,
      status: "completed",
      currentQuestionId: null,
      updatedAt: nowIso()
    });
    persistMemoryStateToDisk();
  }

  isSessionExpired(session: Pick<SessionState, "expiresAt">): boolean {
    return Date.parse(session.expiresAt) <= Date.now();
  }
}

class MemoryDbTargetStorage implements DbTargetStorage {
  async testDbTarget(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  async setActiveDbTarget(workspaceId: string, input: DbTargetInput): Promise<{ targetId: string }> {
    const targetId = makeId("target");
    const current = memoryState.dbTargets.get(workspaceId) ?? [];

    const deactivated = current.map((target) => ({
      ...target,
      isActive: false
    }));

    const nextTarget: DbTargetConfig = {
      id: targetId,
      workspaceId,
      name: input.name,
      host: input.host,
      port: input.port,
      user: input.user,
      passwordEncrypted: encryptSecret(input.password),
      databaseName: input.databaseName,
      sslMode: input.ssl?.mode || "disabled",
      sslCaCert: input.ssl?.ca || null,
      sslClientCert: input.ssl?.cert || null,
      sslClientKey: input.ssl?.key || null,
      isActive: true,
      status: "healthy",
      lastError: null,
      lastTestedAt: nowIso()
    };

    memoryState.dbTargets.set(workspaceId, [nextTarget, ...deactivated]);

    return {
      targetId
    };
  }

  async getActiveDbTarget(workspaceId: string): Promise<DbTargetConfig | null> {
    const active = (memoryState.dbTargets.get(workspaceId) ?? []).find((target) => target.isActive);
    return active ? cloneRecord(active) : null;
  }
}

class MemoryAuditStorage implements AuditStorage {
  async writeEvent(
    workspaceId: string,
    actor: string,
    eventType: string,
    payload: AuditEventPayload
  ): Promise<void> {
    memoryState.auditEvents.unshift({
      id: makeId("audit"),
      workspaceId,
      actor,
      eventType,
      payloadJson: JSON.stringify(payload),
      createdAt: nowIso()
    });
    persistMemoryStateToDisk();
  }
}

class MemoryPlatformSettingsStorage implements PlatformSettingsStorage {
  async get(key: string): Promise<string | null> {
    const store = readLocalJson<Record<string, { value: string; encrypted: boolean }>>(PLATFORM_SETTINGS_KEY);
    if (!store || !store[key]) {
      return null;
    }

    const entry = store[key];
    if (entry.encrypted) {
      return decryptSecret(entry.value);
    }
    return entry.value;
  }

  async set(key: string, value: string, encrypt: boolean): Promise<void> {
    const store = readLocalJson<Record<string, { value: string; encrypted: boolean }>>(PLATFORM_SETTINGS_KEY) ?? {};
    store[key] = {
      value: encrypt ? encryptSecret(value) : value,
      encrypted: encrypt
    };
    writeLocalJson(PLATFORM_SETTINGS_KEY, store);
  }
}

class MemoryWorkspaceStorage implements WorkspaceStorage {
  async get(workspaceId: string): Promise<WorkspaceData | null> {
    const data = memoryState.workspaces.get(workspaceId);
    return data ? cloneRecord(data) : null;
  }

  async set(workspaceId: string, data: WorkspaceData): Promise<void> {
    memoryState.workspaces.set(workspaceId, data);
    persistMemoryStateToDisk();
  }
}

export function createMemoryStorage(): Storage {
  return {
    forms: new MemoryFormStorage(),
    sessions: new MemorySessionStorage(),
    dbTargets: new MemoryDbTargetStorage(),
    audit: new MemoryAuditStorage(),
    platformSettings: new MemoryPlatformSettingsStorage(),
    workspaces: new MemoryWorkspaceStorage()
  };
}

export { memoryState };