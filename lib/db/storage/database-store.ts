import { type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";

import { makeId, slugify } from "@/lib/ids";
import { validateSchema, createEmptySchema } from "@/lib/schema";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import { DEFAULT_WORKSPACE_NAME, RESPONDENT_SESSION_TTL_SECONDS } from "@/lib/server/constants";
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
import { ensureAppTables, getAppPool } from "@/lib/db/platform";

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
  expires_at: string | null;
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
  ssl_mode: string;
  ssl_ca: string | null;
  ssl_cert: string | null;
  ssl_key: string | null;
  is_active: number;
  status: "healthy" | "unhealthy" | "unknown";
  last_error: string | null;
  last_tested_at: string | null;
}

interface PlatformSettingRow extends RowDataPacket {
  key_name: string;
  value_encrypted: string | null;
  value_plain: string | null;
  updated_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
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

class DatabaseFormStorage implements FormStorage {
  async initializeWorkspace(workspaceId: string): Promise<void> {
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

  async createForm(workspaceId: string, title: string): Promise<{ formId: string; slug: string; title: string }> {
    await this.initializeWorkspace(workspaceId);

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

    return {
      formId,
      slug,
      title
    };
  }

  async listForms(workspaceId: string): Promise<FormRecord[]> {
    await this.initializeWorkspace(workspaceId);

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

  async getFormById(formId: string): Promise<FormRecord | null> {
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

  async getDraft(formId: string): Promise<DraftRecord | null> {
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

  async updateDraft(formId: string, schema: FormSchema): Promise<{ ok: boolean; errors: string[] }> {
    const validation = validateSchema(schema, {
      enforceGlobalQuestionIdUniqueness: true
    });
    if (!validation.valid) {
      return {
        ok: false,
        errors: validation.errors
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

    return {
      ok: true,
      errors: []
    };
  }

  async listVersions(formId: string): Promise<FormVersionRecord[]> {
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

  async getVersionByFormAndNumber(formId: string, versionNumber: number): Promise<FormVersionRecord | null> {
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

  async getPublishedBySlug(slug: string, version: number): Promise<{
    formId: string;
    workspaceId: string;
    slug: string;
    title: string;
    versionId: string;
    versionNumber: number;
    schemaJson: string;
  } | null> {
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

  async publishDraft(formId: string, _actor: string): Promise<
    | { ok: true; versionNumber: number; versionId: string }
    | { ok: false; status: number; error: string; errors?: string[] }
  > {
    const form = await this.getFormById(formId);
    if (!form) {
      return {
        ok: false,
        status: 404,
        error: "Form not found"
      };
    }

    const draft = await this.getDraft(formId);
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

    return {
      ok: true,
      versionNumber: nextVersion,
      versionId
    };
  }
}

class DatabaseSessionStorage implements SessionStorage {
  async createSession(data: CreateSessionData): Promise<SessionTokens> {
    const sessionToken = crypto.randomUUID().replace(/-/g, "");
    const resumeToken = crypto.randomUUID().replace(/-/g, "");
    const createdAt = nowIso();
    const expiresAt = computeRespondentSessionExpiry(createdAt);

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
          branch_trace_json,
          expires_at
        )
        VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?, ?)
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
        JSON.stringify([]),
        expiresAt
      ]
    );

    return {
      sessionToken,
      resumeToken,
      expiresAt
    };
  }

  async getSession(sessionToken: string): Promise<SessionState | null> {
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
          expires_at,
          created_at,
          updated_at
        FROM respondent_sessions
        WHERE session_token = ?
        LIMIT 1
      `,
      [sessionToken]
    );

    const row = rows[0];
    return row ? this.mapSessionRow(row) : null;
  }

  async getSessionByResumeToken(resumeToken: string): Promise<SessionState | null> {
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
          expires_at,
          created_at,
          updated_at
        FROM respondent_sessions
        WHERE resume_token = ?
        LIMIT 1
      `,
      [resumeToken]
    );

    const row = rows[0];
    return row ? this.mapSessionRow(row) : null;
  }

  async updateSessionState(data: UpdateSessionData): Promise<void> {
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

  async markSessionCompleted(sessionToken: string): Promise<void> {
    await ensureAppTables();

    const pool = getAppPool();
    await pool.execute(
      `UPDATE respondent_sessions SET status = 'completed', current_question_id = NULL WHERE session_token = ?`,
      [sessionToken]
    );
  }

  isSessionExpired(session: Pick<SessionState, "expiresAt">): boolean {
    return Date.parse(session.expiresAt) <= Date.now();
  }

  private mapSessionRow(row: SessionRow): SessionState {
    const createdAt = new Date(row.created_at).toISOString();

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
      expiresAt: row.expires_at
        ? new Date(row.expires_at).toISOString()
        : computeRespondentSessionExpiry(createdAt),
      createdAt,
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }
}

class DatabaseDbTargetStorage implements DbTargetStorage {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async testDbTarget(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  async setActiveDbTarget(workspaceId: string, input: DbTargetInput): Promise<{ targetId: string }> {
    await ensureAppTables();

    const connection = await this.pool.getConnection();

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
            ssl_mode,
            ssl_ca,
            ssl_cert,
            ssl_key,
            is_active,
            status,
            last_tested_at,
            last_error
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, 'healthy', NOW(), NULL)
        `,
        [
          targetId,
          workspaceId,
          input.name,
          input.host,
          input.port,
          input.user,
          encryptSecret(input.password),
          input.databaseName,
          input.ssl?.mode || 'disabled',
          input.ssl?.ca || null,
          input.ssl?.cert || null,
          input.ssl?.key || null
        ]
      );

      await connection.commit();

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

  async getActiveDbTarget(workspaceId: string): Promise<DbTargetConfig | null> {
    await ensureAppTables();

    const [rows] = await this.pool.execute<DbTargetRow[]>(
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
          ssl_mode,
          ssl_ca,
          ssl_cert,
          ssl_key,
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
      sslMode: row.ssl_mode as DbTargetConfig["sslMode"],
      sslCaCert: row.ssl_ca,
      sslClientCert: row.ssl_cert,
      sslClientKey: row.ssl_key,
      isActive: Boolean(row.is_active),
      status: row.status,
      lastError: row.last_error,
      lastTestedAt: row.last_tested_at ? new Date(row.last_tested_at).toISOString() : null
    };
  }
}

class DatabaseAuditStorage implements AuditStorage {
  async writeEvent(
    workspaceId: string,
    actor: string,
    eventType: string,
    payload: AuditEventPayload,
    connection?: PoolConnection
  ): Promise<void> {
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
}

class DatabasePlatformSettingsStorage implements PlatformSettingsStorage {
  async get(key: string): Promise<string | null> {
    await ensureAppTables();

    const pool = getAppPool();
    const [rows] = await pool.execute<PlatformSettingRow[]>(
      `
        SELECT key_name, value_encrypted, value_plain, updated_at
        FROM platform_settings
        WHERE key_name = ?
        LIMIT 1
      `,
      [key]
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    if (row.value_encrypted) {
      return decryptSecret(row.value_encrypted);
    }

    return row.value_plain;
  }

  async set(key: string, value: string, encrypt: boolean): Promise<void> {
    await ensureAppTables();

    const pool = getAppPool();
    await pool.execute(
      `
        INSERT INTO platform_settings (key_name, value_encrypted, value_plain, updated_at)
        VALUES (?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          value_encrypted = VALUES(value_encrypted),
          value_plain = VALUES(value_plain),
          updated_at = VALUES(updated_at)
      `,
      [key, encrypt ? encryptSecret(value) : null, encrypt ? null : value]
    );
  }
}

class DatabaseWorkspaceStorage implements WorkspaceStorage {
  async get(): Promise<WorkspaceData | null> {
    return null;
  }

  async set(): Promise<void> {
    // Workspaces are managed by FormStorage.initializeWorkspace
  }
}

export function createDatabaseStorage(): Storage {
  const pool = getAppPool();

  return {
    forms: new DatabaseFormStorage(),
    sessions: new DatabaseSessionStorage(),
    dbTargets: new DatabaseDbTargetStorage(pool),
    audit: new DatabaseAuditStorage(),
    platformSettings: new DatabasePlatformSettingsStorage(),
    workspaces: new DatabaseWorkspaceStorage()
  };
}