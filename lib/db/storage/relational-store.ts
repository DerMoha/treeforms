import { questionFacts } from "@/lib/engine";
import { makeId, slugify } from "@/lib/ids";
import { createEmptySchema, validateSchema } from "@/lib/schema";
import { DEFAULT_WORKSPACE_NAME, RESPONDENT_SESSION_TTL_SECONDS } from "@/lib/server/constants";
import {
  type DraftRecord,
  type FormRecord,
  type FormSchema,
  type FormVersionRecord,
  type QuestionType,
  type SessionState
} from "@/lib/types";

import { type DatabaseClient, type QueryParam } from "@/lib/db/storage/client";
import {
  type AuditEventPayload,
  type CreateSessionData,
  type SessionTokens,
  type Storage,
  type SubmissionExportRecord,
  type SubmissionFilterInput,
  type SubmissionListResult,
  type SubmissionRecordDetail,
  type UpdateSessionData
} from "@/lib/db/storage/interface";

interface FormRow {
  id: string;
  workspace_id: string;
  slug: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface DraftRow {
  form_id: string;
  schema_json: string;
  updated_at: string;
}

interface VersionRow {
  id: string;
  form_id: string;
  version_number: number | string;
  schema_json: string;
  published_at: string;
}

interface SessionRow {
  session_token: string;
  resume_token: string;
  workspace_id: string;
  form_id: string;
  version_number: number | string;
  status: "in_progress" | "completed";
  current_question_id: string | null;
  answers_json: string;
  history_json: string;
  branch_trace_json: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

interface SubmissionRow {
  submission_id: string;
  workspace_id: string;
  form_id: string;
  version_number: number | string;
  status: "in_progress" | "completed";
  started_at: string;
  completed_at: string | null;
  branch_trace_json: string;
}

interface AnswerRawRow {
  question_id: string;
  answer_json: string;
  answered_at: string;
  flow_path: string;
}

interface AnswerFactRow {
  question_id: string;
  question_type: string;
  option_id: string | null;
  text_value: string | null;
  number_value: number | string | null;
  flow_path: string;
  answered_at: string;
  submission_id?: string;
}

export function createRelationalStorage(client: DatabaseClient): Storage {
  const forms = new RelationalFormStorage(client);
  const sessions = new RelationalSessionStorage(client);
  const submissions = new RelationalSubmissionStorage(client);
  const audit = new RelationalAuditStorage(client);

  return {
    forms,
    sessions,
    submissions,
    audit
  };
}

class RelationalFormStorage {
  constructor(private readonly client: DatabaseClient) {}

  async initializeWorkspace(workspaceId: string): Promise<void> {
    const existing = await queryOne<{ id: string }>(
      this.client,
      `SELECT id FROM workspaces WHERE id = ? LIMIT 1`,
      [workspaceId]
    );
    const now = nowIso();

    if (existing) {
      await this.client.execute(`UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?`, [
        DEFAULT_WORKSPACE_NAME,
        now,
        workspaceId
      ]);
      return;
    }

    await this.client.execute(
      `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      [workspaceId, DEFAULT_WORKSPACE_NAME, now, now]
    );
  }

  async createForm(workspaceId: string, title: string): Promise<{ formId: string; slug: string; title: string }> {
    return this.client.transaction(async (tx) => {
      await this.initializeWorkspace(workspaceId);

      const existing = await tx.query<{ slug: string }>(
        `SELECT slug FROM forms WHERE workspace_id = ?`,
        [workspaceId]
      );
      const slug = pickUniqueSlug(
        slugify(title),
        new Set(existing.map((row) => String(row.slug)))
      );
      const formId = makeId("form");
      const now = nowIso();

      await tx.execute(
        `
          INSERT INTO forms (id, workspace_id, slug, title, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [formId, workspaceId, slug, title, now, now]
      );

      const schema = createEmptySchema(formId, title);
      await tx.execute(`INSERT INTO drafts (form_id, schema_json, updated_at) VALUES (?, ?, ?)`, [
        formId,
        JSON.stringify(schema),
        now
      ]);

      return {
        formId,
        slug,
        title
      };
    });
  }

  async listForms(workspaceId: string): Promise<FormRecord[]> {
    await this.initializeWorkspace(workspaceId);

    const rows = await this.client.query<FormRow>(
      `
        SELECT id, workspace_id, slug, title, created_at, updated_at
        FROM forms
        WHERE workspace_id = ?
        ORDER BY updated_at DESC
      `,
      [workspaceId]
    );

    return rows.map(mapFormRow);
  }

  async getFormById(formId: string): Promise<FormRecord | null> {
    const row = await queryOne<FormRow>(
      this.client,
      `
        SELECT id, workspace_id, slug, title, created_at, updated_at
        FROM forms
        WHERE id = ?
        LIMIT 1
      `,
      [formId]
    );

    return row ? mapFormRow(row) : null;
  }

  async getDraft(formId: string): Promise<DraftRecord | null> {
    const row = await queryOne<DraftRow>(
      this.client,
      `SELECT form_id, schema_json, updated_at FROM drafts WHERE form_id = ? LIMIT 1`,
      [formId]
    );

    if (!row) {
      return null;
    }

    return {
      formId: row.form_id,
      schemaJson: row.schema_json,
      updatedAt: row.updated_at
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

    await this.client.transaction(async (tx) => {
      const now = nowIso();

      const existingForm = await queryOne<FormRow>(
        tx,
        `SELECT id, workspace_id, slug, title FROM forms WHERE id = ? LIMIT 1`,
        [formId]
      );

      if (!existingForm) {
        throw new Error(`Form ${formId} not found`);
      }

      const existing = await queryOne<{ form_id: string }>(
        tx,
        `SELECT form_id FROM drafts WHERE form_id = ? LIMIT 1`,
        [formId]
      );

      if (existing) {
        await tx.execute(`UPDATE drafts SET schema_json = ?, updated_at = ? WHERE form_id = ?`, [
          JSON.stringify(schema),
          now,
          formId
        ]);
      } else {
        await tx.execute(`INSERT INTO drafts (form_id, schema_json, updated_at) VALUES (?, ?, ?)`, [
          formId,
          JSON.stringify(schema),
          now
        ]);
      }

      let newSlug = existingForm.slug;
      if (schema.title !== existingForm.title) {
        const existingSlugs = await tx.query<{ slug: string }>(
          `SELECT slug FROM forms WHERE workspace_id = ?`,
          [existingForm.workspace_id]
        );
        newSlug = pickUniqueSlug(
          slugify(schema.title),
          new Set(existingSlugs.map((row) => String(row.slug)))
        );
      }

      await tx.execute(`UPDATE forms SET title = ?, slug = ?, updated_at = ? WHERE id = ?`, [
        schema.title,
        newSlug,
        now,
        formId
      ]);
    });

    return {
      ok: true,
      errors: []
    };
  }

  async listVersions(formId: string): Promise<FormVersionRecord[]> {
    const rows = await this.client.query<VersionRow>(
      `
        SELECT id, form_id, version_number, schema_json, published_at
        FROM form_versions
        WHERE form_id = ?
        ORDER BY version_number DESC
      `,
      [formId]
    );

    return rows.map(mapVersionRow);
  }

  async getVersionByFormAndNumber(formId: string, versionNumber: number): Promise<FormVersionRecord | null> {
    const row = await queryOne<VersionRow>(
      this.client,
      `
        SELECT id, form_id, version_number, schema_json, published_at
        FROM form_versions
        WHERE form_id = ? AND version_number = ?
        LIMIT 1
      `,
      [formId, versionNumber]
    );

    return row ? mapVersionRow(row) : null;
  }

  async getPublishedBySlug(slug: string, version: number) {
    const row = await queryOne<{
      form_id: string;
      workspace_id: string;
      slug: string;
      title: string;
      version_id: string;
      version_number: number | string;
      schema_json: string;
    }>(
      this.client,
      `
        SELECT
          f.id AS form_id,
          f.workspace_id,
          f.slug,
          f.title,
          v.id AS version_id,
          v.version_number,
          v.schema_json
        FROM forms f
        INNER JOIN form_versions v ON v.form_id = f.id
        WHERE f.slug = ? AND v.version_number = ?
        LIMIT 1
      `,
      [slug, version]
    );

    if (!row) {
      return null;
    }

    return {
      formId: row.form_id,
      workspaceId: row.workspace_id,
      slug: row.slug,
      title: row.title,
      versionId: row.version_id,
      versionNumber: Number(row.version_number),
      schemaJson: row.schema_json
    };
  }

  async publishDraft(formId: string): Promise<
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

    return this.client.transaction(async (tx) => {
      const versionRow = await queryOne<{ max_version: number | string | null }>(
        tx,
        `SELECT MAX(version_number) AS max_version FROM form_versions WHERE form_id = ?`,
        [formId]
      );
      const versionNumber = Number(versionRow?.max_version ?? 0) + 1;
      const versionId = makeId("ver");

      await tx.execute(
        `
          INSERT INTO form_versions (id, form_id, version_number, schema_json, published_at)
          VALUES (?, ?, ?, ?, ?)
        `,
        [versionId, formId, versionNumber, draft.schemaJson, nowIso()]
      );

      return {
        ok: true as const,
        versionNumber,
        versionId
      };
    });
  }
}

class RelationalSessionStorage {
  constructor(private readonly client: DatabaseClient) {}

  async createSession(data: CreateSessionData): Promise<SessionTokens> {
    const sessionToken = crypto.randomUUID().replace(/-/g, "");
    const resumeToken = crypto.randomUUID().replace(/-/g, "");
    const createdAt = nowIso();
    const expiresAt = computeRespondentSessionExpiry(createdAt);

    await this.client.execute(
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
          expires_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?, ?, ?, ?)
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
        expiresAt,
        createdAt,
        createdAt
      ]
    );

    return {
      sessionToken,
      resumeToken,
      expiresAt
    };
  }

  async getSession(sessionToken: string): Promise<SessionState | null> {
    const row = await queryOne<SessionRow>(
      this.client,
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

    return row ? mapSessionRow(row) : null;
  }

  async getSessionByResumeToken(resumeToken: string): Promise<SessionState | null> {
    const row = await queryOne<SessionRow>(
      this.client,
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

    return row ? mapSessionRow(row) : null;
  }

  async updateSessionState(data: UpdateSessionData): Promise<void> {
    await this.client.execute(
      `
        UPDATE respondent_sessions
        SET current_question_id = ?, answers_json = ?, history_json = ?, branch_trace_json = ?, updated_at = ?
        WHERE session_token = ?
      `,
      [
        data.currentQuestionId,
        data.answersJson,
        data.historyJson,
        data.branchTraceJson,
        nowIso(),
        data.sessionToken
      ]
    );
  }

  async markSessionCompleted(sessionToken: string): Promise<void> {
    await this.client.execute(
      `
        UPDATE respondent_sessions
        SET status = 'completed', current_question_id = NULL, updated_at = ?
        WHERE session_token = ?
      `,
      [nowIso(), sessionToken]
    );
  }

  isSessionExpired(session: Pick<SessionState, "expiresAt">): boolean {
    return Date.parse(session.expiresAt) <= Date.now();
  }
}

class RelationalSubmissionStorage {
  constructor(private readonly client: DatabaseClient) {}

  async persistCompletedSubmission(session: SessionState, schema: FormSchema): Promise<{ submissionId: string }> {
    const submissionId = `sub_${session.sessionToken}`;
    const completedAt = nowIso();
    const { raw, facts } = questionFacts(schema, session.answers);

    await this.client.transaction(async (tx) => {
      await tx.execute(`DELETE FROM answers_raw WHERE submission_id = ?`, [submissionId]);
      await tx.execute(`DELETE FROM answer_facts WHERE submission_id = ?`, [submissionId]);
      await tx.execute(`DELETE FROM submissions WHERE submission_id = ?`, [submissionId]);

      await tx.execute(
        `
          INSERT INTO submissions (
            submission_id,
            workspace_id,
            form_id,
            version_number,
            status,
            started_at,
            completed_at,
            branch_trace_json
          )
          VALUES (?, ?, ?, ?, 'completed', ?, ?, ?)
        `,
        [
          submissionId,
          session.workspaceId,
          session.formId,
          session.versionNumber,
          session.createdAt,
          completedAt,
          JSON.stringify(session.branchTrace)
        ]
      );

      for (const item of raw) {
        await tx.execute(
          `
            INSERT INTO answers_raw (submission_id, question_id, answer_json, flow_path, answered_at)
            VALUES (?, ?, ?, ?, ?)
          `,
          [submissionId, item.questionId, item.answerJson, item.flowPath, item.answeredAt]
        );
      }

      for (const fact of facts) {
        await tx.execute(
          `
            INSERT INTO answer_facts (
              submission_id,
              question_id,
              question_type,
              option_id,
              text_value,
              number_value,
              flow_path,
              answered_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            submissionId,
            fact.questionId,
            fact.questionType,
            fact.optionId,
            fact.textValue,
            fact.numberValue,
            fact.flowPath,
            fact.answeredAt
          ]
        );
      }
    });

    return { submissionId };
  }

  async getSubmissionById(
    workspaceId: string,
    formId: string,
    submissionId: string
  ): Promise<SubmissionRecordDetail | null> {
    const submission = await queryOne<SubmissionRow>(
      this.client,
      `
        SELECT submission_id, workspace_id, form_id, version_number, status, started_at, completed_at, branch_trace_json
        FROM submissions
        WHERE submission_id = ? AND workspace_id = ? AND form_id = ?
        LIMIT 1
      `,
      [submissionId, workspaceId, formId]
    );

    if (!submission) {
      return null;
    }

    const [rawRows, factRows] = await Promise.all([
      this.client.query<AnswerRawRow>(
        `
          SELECT question_id, answer_json, answered_at, flow_path
          FROM answers_raw
          WHERE submission_id = ?
          ORDER BY answered_at ASC
        `,
        [submissionId]
      ),
      this.client.query<AnswerFactRow>(
        `
          SELECT question_id, question_type, option_id, text_value, number_value, flow_path, answered_at
          FROM answer_facts
          WHERE submission_id = ?
          ORDER BY answered_at ASC
        `,
        [submissionId]
      )
    ]);

    return {
      submissionId: submission.submission_id,
      workspaceId: submission.workspace_id,
      formId: submission.form_id,
      versionNumber: Number(submission.version_number),
      status: submission.status,
      startedAt: submission.started_at,
      completedAt: submission.completed_at,
      branchTrace: safeStringArray(submission.branch_trace_json),
      raw: rawRows.map((row) => ({
        questionId: row.question_id,
        answerJson: row.answer_json,
        answeredAt: row.answered_at,
        flowPath: row.flow_path
      })),
      facts: factRows.map(mapFactRow),
      source: this.client.dialect
    };
  }

  async listSubmissionsForForm(
    workspaceId: string,
    formId: string,
    filters: SubmissionFilterInput
  ): Promise<SubmissionListResult> {
    const page = Math.max(1, Number(filters.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(filters.pageSize ?? 25)));
    const clauses = ["workspace_id = ?", "form_id = ?"];
    const params: QueryParam[] = [workspaceId, formId];

    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }

    if (filters.version) {
      clauses.push("version_number = ?");
      params.push(filters.version);
    }

    if (filters.dateFrom) {
      clauses.push("started_at >= ?");
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      clauses.push("started_at <= ?");
      params.push(filters.dateTo);
    }

    const rows = await this.client.query<SubmissionRow>(
      `
        SELECT submission_id, workspace_id, form_id, version_number, status, started_at, completed_at, branch_trace_json
        FROM submissions
        WHERE ${clauses.join(" AND ")}
        ORDER BY started_at DESC
      `,
      params
    );

    const filtered = rows.filter((row) => {
      if (!filters.branchContains) {
        return true;
      }

      return safeStringArray(row.branch_trace_json).some((entry) =>
        entry.includes(filters.branchContains ?? "")
      );
    });

    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    return {
      page,
      pageSize,
      total: filtered.length,
      items: paged.map((row) => ({
        submissionId: row.submission_id,
        status: row.status,
        versionNumber: Number(row.version_number),
        startedAt: row.started_at,
        completedAt: row.completed_at,
        branchTrace: safeStringArray(row.branch_trace_json),
        source: this.client.dialect
      }))
    };
  }

  async listSubmissionExports(workspaceId: string, formId: string): Promise<SubmissionExportRecord[]> {
    const [submissions, facts] = await Promise.all([
      this.client.query<SubmissionRow>(
        `
          SELECT submission_id, workspace_id, form_id, version_number, status, started_at, completed_at, branch_trace_json
          FROM submissions
          WHERE workspace_id = ? AND form_id = ?
          ORDER BY started_at ASC
        `,
        [workspaceId, formId]
      ),
      this.client.query<AnswerFactRow>(
        `
          SELECT af.submission_id, af.question_id, af.question_type, af.option_id, af.text_value, af.number_value, af.flow_path, af.answered_at
          FROM answer_facts af
          INNER JOIN submissions s ON s.submission_id = af.submission_id
          WHERE s.workspace_id = ? AND s.form_id = ?
          ORDER BY af.answered_at ASC
        `,
        [workspaceId, formId]
      )
    ]);

    const factsBySubmission = new Map<string, SubmissionExportRecord["facts"]>();

    facts.forEach((row) => {
      const submissionId = String(row.submission_id ?? "");
      if (!submissionId) {
        return;
      }

      const current = factsBySubmission.get(submissionId) ?? [];
      current.push(mapFactRow(row));
      factsBySubmission.set(submissionId, current);
    });

    return submissions.map((row) => ({
      submissionId: row.submission_id,
      versionNumber: Number(row.version_number),
      startedAt: row.started_at,
      completedAt: row.completed_at,
      status: row.status,
      branchTrace: safeStringArray(row.branch_trace_json),
      facts: factsBySubmission.get(row.submission_id) ?? []
    }));
  }
}

class RelationalAuditStorage {
  constructor(private readonly client: DatabaseClient) {}

  async writeEvent(
    workspaceId: string,
    actor: string,
    eventType: string,
    payload: AuditEventPayload
  ): Promise<void> {
    await this.client.execute(
      `
        INSERT INTO audit_events (id, workspace_id, actor, event_type, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [makeId("audit"), workspaceId, actor, eventType, JSON.stringify(payload), nowIso()]
    );
  }
}

async function queryOne<T>(
  client: DatabaseClient,
  sql: string,
  params: QueryParam[] = []
): Promise<T | null> {
  const rows = await client.query<T>(sql, params);
  return rows[0] ?? null;
}

function nowIso() {
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

function safeStringArray(value: string): string[] {
  const parsed = safeJson<unknown>(value, []);
  return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
}

function mapFormRow(row: FormRow): FormRecord {
  return {
    formId: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapVersionRow(row: VersionRow): FormVersionRecord {
  return {
    id: row.id,
    formId: row.form_id,
    versionNumber: Number(row.version_number),
    schemaJson: row.schema_json,
    publishedAt: row.published_at
  };
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
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapFactRow(row: AnswerFactRow) {
  return {
    questionId: row.question_id,
    questionType: row.question_type as QuestionType,
    optionId: row.option_id,
    textValue: row.text_value,
    numberValue:
      row.number_value === null || row.number_value === undefined ? null : Number(row.number_value),
    flowPath: row.flow_path,
    answeredAt: row.answered_at
  };
}

function pickUniqueSlug(baseSlug: string, existingSlugs: Set<string>) {
  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let counter = 2;
  while (existingSlugs.has(`${baseSlug}-${counter}`)) {
    counter += 1;
  }

  return `${baseSlug}-${counter}`;
}
