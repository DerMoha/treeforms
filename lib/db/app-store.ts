import { type PoolConnection, type RowDataPacket } from "mysql2/promise";

import { makeId, slugify } from "@/lib/ids";
import { readLocalJson, writeLocalJson } from "@/lib/db/local-sqlite";
import { createEmptySchema, validateSchema } from "@/lib/schema";
import {
  ensureAppTables,
  ensureSubmissionTables,
  getAppPool,
  getExternalPool,
  getPlatformSubmissionPool,
  isAppDbConfigured,
  isSubmissionDbConfigured,
  pingPool,
  buildMysqlUrl
} from "@/lib/db/platform";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import { DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME } from "@/lib/server/constants";
import {
  type DbTargetConfig,
  type DbTargetInput,
  type DraftRecord,
  type FormRecord,
  type FormSchema,
  type FormVersionRecord,
  type SessionState
} from "@/lib/types";

interface SessionRow extends RowDataPacket {
  session_token: string;
  resume_token: string;
  workspace_id: string;
  form_id: string;
  version_number: number;
  status: "in_progress" | "completed";
  current_question_id: string | null;
  answers_json: string;
  history_json: string;
  branch_trace_json: string;
  created_at: string;
  updated_at: string;
}

interface DbTargetRow extends RowDataPacket {
  id: string;
  workspace_id: string;
  name: string;
  host: string;
  port: number;
  user_name: string;
  password_encrypted: string;
  database_name: string;
  is_active: number;
  status: "healthy" | "unhealthy" | "unknown";
  last_error: string | null;
  last_tested_at: string | null;
}

interface MemoryAuditEvent {
  id: string;
  workspaceId: string;
  actor: string;
  eventType: string;
  payloadJson: string;
  createdAt: string;
}

interface MemoryState {
  workspaces: Map<string, { id: string; name: string; createdAt: string }>;
  forms: Map<string, FormRecord>;
  drafts: Map<string, DraftRecord>;
  versions: Map<string, FormVersionRecord[]>;
  sessions: Map<string, SessionState>;
  sessionByResumeToken: Map<string, string>;
  dbTargets: Map<string, DbTargetConfig[]>;
  auditEvents: MemoryAuditEvent[];
}

interface SerializedMemoryState {
  workspaces: Array<[string, { id: string; name: string; createdAt: string }]>;
  forms: Array<[string, FormRecord]>;
  drafts: Array<[string, DraftRecord]>;
  versions: Array<[string, FormVersionRecord[]]>;
  sessions: Array<[string, SessionState]>;
  sessionByResumeToken: Array<[string, string]>;
  dbTargets: Array<[string, DbTargetConfig[]]>;
  auditEvents: MemoryAuditEvent[];
}

const APP_STORE_STATE_KEY = "treeforms.app-store.v1";

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

if (!isAppDbConfigured()) {
  hydrateMemoryStateFromDisk();
}

export async function initializeWorkspace(workspaceId = DEFAULT_WORKSPACE_ID) {
  if (!isAppDbConfigured()) {
    const existing = memoryState.workspaces.get(workspaceId);

    if (!existing) {
      memoryState.workspaces.set(workspaceId, {
        id: workspaceId,
        name: DEFAULT_WORKSPACE_NAME,
        createdAt: nowIso()
      });
      persistMemoryStateToDisk();
    }

    return;
  }

  await ensureAppTables();

  const pool = getAppPool();

  await pool.execute(
    `
      INSERT INTO workspaces (id, name)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `,
    [workspaceId, DEFAULT_WORKSPACE_NAME]
  );

  const userId = `user_${workspaceId}`;
  const email = `${workspaceId}@treeforms.local`;

  await pool.execute(
    `
      INSERT INTO users (id, email, name)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `,
    [userId, email, "Workspace Owner"]
  );

  await pool.execute(
    `
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (?, ?, 'owner')
      ON DUPLICATE KEY UPDATE role = VALUES(role)
    `,
    [workspaceId, userId]
  );
}

export async function createForm(workspaceId: string, title: string) {
  await initializeWorkspace(workspaceId);

  if (!isAppDbConfigured()) {
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

    await writeAuditEvent(workspaceId, "system", "form.created", {
      formId,
      title
    });

    return {
      formId,
      slug,
      title
    };
  }

  const pool = getAppPool();
  const formId = makeId("form");
  const baseSlug = slugify(title);
  let slug = baseSlug;

  for (let attempts = 0; attempts < 4; attempts += 1) {
    try {
      await pool.execute(
        `INSERT INTO forms (id, workspace_id, slug, title) VALUES (?, ?, ?, ?)`,
        [formId, workspaceId, slug, title]
      );
      break;
    } catch (error) {
      if (attempts >= 3) {
        throw error;
      }
      slug = `${baseSlug}-${Math.floor(Math.random() * 10000)}`;
    }
  }

  const schema = createEmptySchema(formId, title);

  await pool.execute(
    `INSERT INTO drafts (form_id, schema_json) VALUES (?, ?)`,
    [formId, JSON.stringify(schema)]
  );

  await writeAuditEvent(workspaceId, "system", "form.created", {
    formId,
    title
  });

  return {
    formId,
    slug,
    title
  };
}

export async function listForms(workspaceId: string): Promise<FormRecord[]> {
  await initializeWorkspace(workspaceId);

  if (!isAppDbConfigured()) {
    return Array.from(memoryState.forms.values())
      .filter((form) => form.workspaceId === workspaceId)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .map(cloneRecord);
  }

  const pool = getAppPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `
      SELECT id, workspace_id, slug, title, created_at, updated_at
      FROM forms
      WHERE workspace_id = ?
      ORDER BY updated_at DESC
    `,
    [workspaceId]
  );

  return rows.map((row) => ({
    formId: String(row.id),
    workspaceId: String(row.workspace_id),
    slug: String(row.slug),
    title: String(row.title),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  }));
}

export async function getFormById(formId: string): Promise<FormRecord | null> {
  if (!isAppDbConfigured()) {
    const record = memoryState.forms.get(formId);
    return record ? cloneRecord(record) : null;
  }

  await ensureAppTables();

  const pool = getAppPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `
      SELECT id, workspace_id, slug, title, created_at, updated_at
      FROM forms
      WHERE id = ?
      LIMIT 1
    `,
    [formId]
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    formId: String(row.id),
    workspaceId: String(row.workspace_id),
    slug: String(row.slug),
    title: String(row.title),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

export async function getDraft(formId: string): Promise<DraftRecord | null> {
  if (!isAppDbConfigured()) {
    const draft = memoryState.drafts.get(formId);
    return draft ? cloneRecord(draft) : null;
  }

  await ensureAppTables();

  const pool = getAppPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `
      SELECT form_id, schema_json, updated_at
      FROM drafts
      WHERE form_id = ?
      LIMIT 1
    `,
    [formId]
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    formId: String(row.form_id),
    schemaJson: String(row.schema_json),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

export async function updateDraft(formId: string, schema: FormSchema, actor = "system") {
  const validation = validateSchema(schema);
  if (!validation.valid) {
    return {
      ok: false as const,
      errors: validation.errors
    };
  }

  if (!isAppDbConfigured()) {
    const form = memoryState.forms.get(formId);

    if (!form) {
      return {
        ok: false as const,
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

    await writeAuditEvent(form.workspaceId, actor, "draft.updated", { formId });

    return {
      ok: true as const,
      errors: []
    };
  }

  await ensureAppTables();

  const pool = getAppPool();

  await pool.execute(
    `
      INSERT INTO drafts (form_id, schema_json)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE schema_json = VALUES(schema_json)
    `,
    [formId, JSON.stringify(schema)]
  );

  await pool.execute(`UPDATE forms SET title = ? WHERE id = ?`, [schema.title, formId]);

  const form = await getFormById(formId);
  if (form) {
    await writeAuditEvent(form.workspaceId, actor, "draft.updated", { formId });
  }

  return {
    ok: true as const,
    errors: []
  };
}

export async function listVersions(formId: string): Promise<FormVersionRecord[]> {
  if (!isAppDbConfigured()) {
    return [...(memoryState.versions.get(formId) ?? [])]
      .sort((a, b) => b.versionNumber - a.versionNumber)
      .map(cloneRecord);
  }

  await ensureAppTables();

  const pool = getAppPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `
      SELECT id, form_id, version_number, schema_json, published_at
      FROM form_versions
      WHERE form_id = ?
      ORDER BY version_number DESC
    `,
    [formId]
  );

  return rows.map((row) => ({
    id: String(row.id),
    formId: String(row.form_id),
    versionNumber: Number(row.version_number),
    schemaJson: String(row.schema_json),
    publishedAt: new Date(String(row.published_at)).toISOString()
  }));
}

export async function publishDraft(formId: string, actor = "system") {
  const form = await getFormById(formId);
  if (!form) {
    return {
      ok: false as const,
      status: 404,
      error: "Form not found"
    };
  }

  const draft = await getDraft(formId);
  if (!draft) {
    return {
      ok: false as const,
      status: 400,
      error: "Draft not found"
    };
  }

  const schema = JSON.parse(draft.schemaJson) as FormSchema;
  const validation = validateSchema(schema);

  if (!validation.valid) {
    return {
      ok: false as const,
      status: 422,
      error: "Draft validation failed",
      errors: validation.errors
    };
  }

  if (!isAppDbConfigured()) {
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

    await writeAuditEvent(form.workspaceId, actor, "form.published", {
      formId,
      version: nextVersion
    });

    return {
      ok: true as const,
      versionNumber: nextVersion,
      versionId: versionRecord.id
    };
  }

  await ensureAppTables();

  const pool = getAppPool();
  const [versionRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COALESCE(MAX(version_number), 0) AS max_version FROM form_versions WHERE form_id = ?`,
    [formId]
  );

  const nextVersion = Number(versionRows[0]?.max_version ?? 0) + 1;
  const versionId = makeId("ver");

  await pool.execute(
    `
      INSERT INTO form_versions (id, form_id, version_number, schema_json)
      VALUES (?, ?, ?, ?)
    `,
    [versionId, formId, nextVersion, draft.schemaJson]
  );

  await writeAuditEvent(form.workspaceId, actor, "form.published", {
    formId,
    version: nextVersion
  });

  return {
    ok: true as const,
    versionNumber: nextVersion,
    versionId
  };
}

export async function getVersionByFormAndNumber(formId: string, versionNumber: number) {
  if (!isAppDbConfigured()) {
    const version = (memoryState.versions.get(formId) ?? []).find(
      (entry) => entry.versionNumber === versionNumber
    );

    return version ? cloneRecord(version) : null;
  }

  await ensureAppTables();

  const pool = getAppPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `
      SELECT id, form_id, version_number, schema_json, published_at
      FROM form_versions
      WHERE form_id = ? AND version_number = ?
      LIMIT 1
    `,
    [formId, versionNumber]
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    formId: String(row.form_id),
    versionNumber: Number(row.version_number),
    schemaJson: String(row.schema_json),
    publishedAt: new Date(String(row.published_at)).toISOString()
  };
}

export async function getPublishedBySlug(slug: string, version: number) {
  if (!isAppDbConfigured()) {
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

  await ensureAppTables();

  const pool = getAppPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `
      SELECT f.id AS form_id, f.workspace_id, f.slug, f.title, v.id AS version_id, v.version_number, v.schema_json
      FROM forms f
      JOIN form_versions v ON v.form_id = f.id
      WHERE f.slug = ? AND v.version_number = ?
      LIMIT 1
    `,
    [slug, version]
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    formId: String(row.form_id),
    workspaceId: String(row.workspace_id),
    slug: String(row.slug),
    title: String(row.title),
    versionId: String(row.version_id),
    versionNumber: Number(row.version_number),
    schemaJson: String(row.schema_json)
  };
}

export async function createSession(data: {
  workspaceId: string;
  formId: string;
  versionNumber: number;
  currentQuestionId: string | null;
}) {
  const sessionToken = crypto.randomUUID().replace(/-/g, "");
  const resumeToken = crypto.randomUUID().replace(/-/g, "");

  if (!isAppDbConfigured()) {
    const now = nowIso();

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
      createdAt: now,
      updatedAt: now
    };

    memoryState.sessions.set(sessionToken, session);
    memoryState.sessionByResumeToken.set(resumeToken, sessionToken);
    persistMemoryStateToDisk();

    return {
      sessionToken,
      resumeToken
    };
  }

  await ensureAppTables();

  const pool = getAppPool();

  await pool.execute(
    `
      INSERT INTO respondent_sessions (
        session_token,
        resume_token,
        workspace_id,
        form_id,
        version_number,
        status,
        current_question_id,
        answers_json,
        history_json,
        branch_trace_json
      )
      VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?)
    `,
    [
      sessionToken,
      resumeToken,
      data.workspaceId,
      data.formId,
      data.versionNumber,
      data.currentQuestionId,
      JSON.stringify({}),
      JSON.stringify([]),
      JSON.stringify([])
    ]
  );

  return {
    sessionToken,
    resumeToken
  };
}

export async function getSession(sessionToken: string): Promise<SessionState | null> {
  if (!isAppDbConfigured()) {
    const session = memoryState.sessions.get(sessionToken);
    return session ? cloneRecord(session) : null;
  }

  await ensureAppTables();

  const pool = getAppPool();
  const [rows] = await pool.execute<SessionRow[]>(
    `
      SELECT
        session_token,
        resume_token,
        workspace_id,
        form_id,
        version_number,
        status,
        current_question_id,
        answers_json,
        history_json,
        branch_trace_json,
        created_at,
        updated_at
      FROM respondent_sessions
      WHERE session_token = ?
      LIMIT 1
    `,
    [sessionToken]
  );

  const row = rows[0];
  return row ? mapSessionRow(row) : null;
}

export async function getSessionByResumeToken(resumeToken: string): Promise<SessionState | null> {
  if (!isAppDbConfigured()) {
    const sessionToken = memoryState.sessionByResumeToken.get(resumeToken);
    if (!sessionToken) {
      return null;
    }

    const session = memoryState.sessions.get(sessionToken);
    return session ? cloneRecord(session) : null;
  }

  await ensureAppTables();

  const pool = getAppPool();
  const [rows] = await pool.execute<SessionRow[]>(
    `
      SELECT
        session_token,
        resume_token,
        workspace_id,
        form_id,
        version_number,
        status,
        current_question_id,
        answers_json,
        history_json,
        branch_trace_json,
        created_at,
        updated_at
      FROM respondent_sessions
      WHERE resume_token = ?
      LIMIT 1
    `,
    [resumeToken]
  );

  const row = rows[0];
  return row ? mapSessionRow(row) : null;
}

export async function updateSessionState(data: {
  sessionToken: string;
  currentQuestionId: string | null;
  answersJson: string;
  historyJson: string;
  branchTraceJson: string;
}) {
  if (!isAppDbConfigured()) {
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
    return;
  }

  await ensureAppTables();

  const pool = getAppPool();
  await pool.execute(
    `
      UPDATE respondent_sessions
      SET current_question_id = ?, answers_json = ?, history_json = ?, branch_trace_json = ?
      WHERE session_token = ?
    `,
    [
      data.currentQuestionId,
      data.answersJson,
      data.historyJson,
      data.branchTraceJson,
      data.sessionToken
    ]
  );
}

export async function markSessionCompleted(sessionToken: string) {
  if (!isAppDbConfigured()) {
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

    return;
  }

  await ensureAppTables();

  const pool = getAppPool();
  await pool.execute(
    `UPDATE respondent_sessions SET status = 'completed', current_question_id = NULL WHERE session_token = ?`,
    [sessionToken]
  );
}

export async function testDbTarget(input: DbTargetInput) {
  const url = buildMysqlUrl({
    host: input.host,
    port: input.port,
    user: input.user,
    password: input.password,
    databaseName: input.databaseName
  });

  const pool = getExternalPool(url);
  await pingPool(pool);
  await ensureSubmissionTables(pool);

  return {
    ok: true
  };
}

export async function setActiveDbTarget(workspaceId: string, input: DbTargetInput) {
  await initializeWorkspace(workspaceId);

  const url = buildMysqlUrl({
    host: input.host,
    port: input.port,
    user: input.user,
    password: input.password,
    databaseName: input.databaseName
  });

  const externalPool = getExternalPool(url);
  await pingPool(externalPool);
  await ensureSubmissionTables(externalPool);

  if (!isAppDbConfigured()) {
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
      isActive: true,
      status: "healthy",
      lastError: null,
      lastTestedAt: nowIso()
    };

    memoryState.dbTargets.set(workspaceId, [nextTarget, ...deactivated]);

    await writeAuditEvent(workspaceId, "system", "db_target.activated", {
      targetId,
      name: input.name,
      host: input.host,
      databaseName: input.databaseName
    });

    return {
      targetId
    };
  }

  const pool = getAppPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(`UPDATE db_targets SET is_active = FALSE WHERE workspace_id = ?`, [workspaceId]);

    const targetId = makeId("target");
    await connection.execute(
      `
        INSERT INTO db_targets (
          id,
          workspace_id,
          name,
          host,
          port,
          user_name,
          password_encrypted,
          database_name,
          is_active,
          status,
          last_tested_at,
          last_error
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, 'healthy', NOW(), NULL)
      `,
      [
        targetId,
        workspaceId,
        input.name,
        input.host,
        input.port,
        input.user,
        encryptSecret(input.password),
        input.databaseName
      ]
    );

    await connection.commit();

    await writeAuditEvent(workspaceId, "system", "db_target.activated", {
      targetId,
      name: input.name,
      host: input.host,
      databaseName: input.databaseName
    });

    return {
      targetId
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getActiveDbTarget(workspaceId: string): Promise<DbTargetConfig | null> {
  if (!isAppDbConfigured()) {
    const active = (memoryState.dbTargets.get(workspaceId) ?? []).find((target) => target.isActive);
    return active ? cloneRecord(active) : null;
  }

  await ensureAppTables();

  const pool = getAppPool();
  const [rows] = await pool.execute<DbTargetRow[]>(
    `
      SELECT
        id,
        workspace_id,
        name,
        host,
        port,
        user_name,
        password_encrypted,
        database_name,
        is_active,
        status,
        last_error,
        last_tested_at
      FROM db_targets
      WHERE workspace_id = ? AND is_active = TRUE
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [workspaceId]
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    host: row.host,
    port: Number(row.port),
    user: row.user_name,
    passwordEncrypted: row.password_encrypted,
    databaseName: row.database_name,
    isActive: Boolean(row.is_active),
    status: row.status,
    lastError: row.last_error,
    lastTestedAt: row.last_tested_at ? new Date(row.last_tested_at).toISOString() : null
  };
}

export async function getSubmissionPoolForWorkspace(workspaceId: string) {
  if (!isSubmissionDbConfigured()) {
    throw new Error("No submission database is configured.");
  }

  await ensureSubmissionTables(getPlatformSubmissionPool());

  const target = await getActiveDbTarget(workspaceId);
  if (!target || target.status !== "healthy") {
    return {
      pool: getPlatformSubmissionPool(),
      source: "platform" as const
    };
  }

  const url = buildMysqlUrl({
    host: target.host,
    port: target.port,
    user: target.user,
    password: decryptSecret(target.passwordEncrypted),
    databaseName: target.databaseName
  });

  const pool = getExternalPool(url);
  await ensureSubmissionTables(pool);

  return {
    pool,
    source: "external" as const,
    target
  };
}

export async function getReadableSubmissionPools(workspaceId: string) {
  if (!isSubmissionDbConfigured()) {
    return [] as { pool: ReturnType<typeof getPlatformSubmissionPool>; source: "platform" | "external" }[];
  }

  const pools: { pool: ReturnType<typeof getPlatformSubmissionPool>; source: "platform" | "external" }[] = [];

  const platformPool = getPlatformSubmissionPool();
  await ensureSubmissionTables(platformPool);
  pools.push({ pool: platformPool, source: "platform" });

  const target = await getActiveDbTarget(workspaceId);
  if (target && target.status === "healthy") {
    const url = buildMysqlUrl({
      host: target.host,
      port: target.port,
      user: target.user,
      password: decryptSecret(target.passwordEncrypted),
      databaseName: target.databaseName
    });

    const externalPool = getExternalPool(url);
    await ensureSubmissionTables(externalPool);

    if (externalPool !== platformPool) {
      pools.push({ pool: externalPool, source: "external" });
    }
  }

  return pools;
}

async function writeAuditEvent(
  workspaceId: string,
  actor: string,
  eventType: string,
  payload: Record<string, unknown>,
  connection?: PoolConnection
) {
  if (!isAppDbConfigured()) {
    memoryState.auditEvents.unshift({
      id: makeId("audit"),
      workspaceId,
      actor,
      eventType,
      payloadJson: JSON.stringify(payload),
      createdAt: nowIso()
    });
    persistMemoryStateToDisk();
    return;
  }

  await ensureAppTables();

  const pool = getAppPool();
  const executor = connection ?? pool;

  await executor.execute(
    `
      INSERT INTO audit_events (id, workspace_id, actor, event_type, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `,
    [makeId("audit"), workspaceId, actor, eventType, JSON.stringify(payload)]
  );
}

function mapSessionRow(row: SessionRow): SessionState {
  return {
    sessionToken: row.session_token,
    resumeToken: row.resume_token,
    workspaceId: row.workspace_id,
    formId: row.form_id,
    versionNumber: Number(row.version_number),
    status: row.status,
    currentQuestionId: row.current_question_id,
    answers: safeJson(row.answers_json, {}),
    history: safeJson(row.history_json, []),
    branchTrace: safeJson(row.branch_trace_json, []),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function cloneRecord<T>(record: T): T {
  return structuredClone(record);
}

function uniqueSlug(workspaceId: string, baseSlug: string) {
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

function hydrateMemoryStateFromDisk() {
  const stored = readLocalJson<Partial<SerializedMemoryState>>(APP_STORE_STATE_KEY);
  if (!stored) {
    return;
  }

  try {
    memoryState.workspaces = new Map(stored.workspaces ?? []);
    memoryState.forms = new Map(stored.forms ?? []);
    memoryState.drafts = new Map(stored.drafts ?? []);
    memoryState.versions = new Map(stored.versions ?? []);
    memoryState.sessions = new Map(stored.sessions ?? []);
    memoryState.sessionByResumeToken = new Map(stored.sessionByResumeToken ?? []);
    memoryState.dbTargets = new Map(stored.dbTargets ?? []);
    memoryState.auditEvents = Array.isArray(stored.auditEvents) ? stored.auditEvents : [];
  } catch {
    // Keep defaults if persisted data is malformed.
  }
}

function persistMemoryStateToDisk() {
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
