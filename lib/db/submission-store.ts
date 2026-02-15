import { type Pool, type RowDataPacket } from "mysql2/promise";

import { questionFacts } from "@/lib/engine";
import { getReadableSubmissionPools, getSubmissionPoolForWorkspace } from "@/lib/db/app-store";
import { readLocalJson, writeLocalJson } from "@/lib/db/local-sqlite";
import { isSubmissionDbConfigured } from "@/lib/db/platform";
import {
  buildSchemaLabelIndex,
  describeBranchTrace,
  describeFlowPath,
  formatQuestionOption,
  getOptionContext,
  getQuestionLabel,
  type SchemaLabelIndex
} from "@/lib/label-index";
import { type FormSchema, type SessionState, type QuestionType } from "@/lib/types";

interface SubmissionFilterInput {
  status?: string | null;
  version?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  branchContains?: string | null;
  page?: number;
  pageSize?: number;
}

interface MemorySubmission {
  submissionId: string;
  workspaceId: string;
  formId: string;
  versionNumber: number;
  status: "in_progress" | "completed";
  startedAt: string;
  completedAt: string | null;
  branchTrace: string[];
  raw: Array<{
    questionId: string;
    answerJson: string;
    answeredAt: string;
    flowPath: string;
  }>;
  facts: Array<{
    questionId: string;
    questionType: string;
    optionId: string | null;
    textValue: string | null;
    numberValue: number | null;
    flowPath: string;
    answeredAt: string;
  }>;
}

interface ExportSchemaVersion {
  versionNumber: number;
  schema: FormSchema;
}

type SerializedMemorySubmissions = Array<[string, MemorySubmission]>;

const SUBMISSION_STORE_STATE_KEY = "treeforms.submissions.v1";

declare global {
  // eslint-disable-next-line no-var
  var __TREEFORMS_MEMORY_SUBMISSIONS: Map<string, MemorySubmission> | undefined;
}

const memorySubmissions =
  globalThis.__TREEFORMS_MEMORY_SUBMISSIONS ?? new Map<string, MemorySubmission>();

globalThis.__TREEFORMS_MEMORY_SUBMISSIONS = memorySubmissions;

if (!isSubmissionDbConfigured()) {
  hydrateMemorySubmissionsFromDisk();
}

export async function persistCompletedSubmission(session: SessionState, schema: FormSchema) {
  const submissionId = `sub_${session.sessionToken}`;
  const { raw, facts } = questionFacts(schema, session.answers);

  if (!isSubmissionDbConfigured()) {
    memorySubmissions.set(submissionId, {
      submissionId,
      workspaceId: session.workspaceId,
      formId: session.formId,
      versionNumber: session.versionNumber,
      status: "completed",
      startedAt: session.createdAt,
      completedAt: nowIso(),
      branchTrace: [...session.branchTrace],
      raw,
      facts
    });
    persistMemorySubmissionsToDisk();

    return { submissionId };
  }

  await runWithRetries(async () => {
    const { pool } = await getSubmissionPoolForWorkspace(session.workspaceId);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await connection.execute(
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
          VALUES (?, ?, ?, ?, 'completed', ?, NOW(), ?)
          ON DUPLICATE KEY UPDATE
            status = VALUES(status),
            completed_at = VALUES(completed_at),
            branch_trace_json = VALUES(branch_trace_json)
        `,
        [
          submissionId,
          session.workspaceId,
          session.formId,
          session.versionNumber,
          session.createdAt,
          JSON.stringify(session.branchTrace)
        ]
      );

      await connection.execute(`DELETE FROM answers_raw WHERE submission_id = ?`, [submissionId]);
      await connection.execute(`DELETE FROM answer_facts WHERE submission_id = ?`, [submissionId]);

      for (const item of raw) {
        await connection.execute(
          `
            INSERT INTO answers_raw (submission_id, question_id, answer_json, flow_path, answered_at)
            VALUES (?, ?, ?, ?, ?)
          `,
          [submissionId, item.questionId, item.answerJson, item.flowPath, item.answeredAt]
        );
      }

      for (const fact of facts) {
        await connection.execute(
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

      await connection.execute(
        `
          INSERT INTO submission_events (submission_id, event_type, payload_json)
          VALUES (?, 'completed', ?)
        `,
        [
          submissionId,
          JSON.stringify({
            completedAt: new Date().toISOString(),
            answerCount: Object.keys(session.answers).length
          })
        ]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });

  return {
    submissionId
  };
}

export async function getSubmissionById(workspaceId: string, formId: string, submissionId: string) {
  if (!isSubmissionDbConfigured()) {
    const submission = memorySubmissions.get(submissionId);
    if (!submission || submission.workspaceId !== workspaceId || submission.formId !== formId) {
      return null;
    }
    return submission;
  }

  const pools = await getReadableSubmissionPools(workspaceId);

  for (const poolEntry of pools) {
    const [rows] = await poolEntry.pool.execute<RowDataPacket[]>(
      `
        SELECT 
          s.submission_id,
          s.workspace_id,
          s.form_id,
          s.version_number,
          s.status,
          s.started_at,
          s.completed_at,
          s.branch_trace_json,
          af.question_id,
          af.question_type,
          af.option_id,
          af.text_value,
          af.number_value,
          af.flow_path,
          af.answered_at
        FROM submissions s
        LEFT JOIN answer_facts af ON af.submission_id = s.submission_id
        WHERE s.submission_id = ? AND s.workspace_id = ? AND s.form_id = ?
      `,
      [submissionId, workspaceId, formId]
    );

    if (rows.length === 0) {
      continue;
    }

    const firstRow = rows[0];
    const facts = rows
      .filter((row) => row.question_id !== null)
      .map((row) => ({
        questionId: String(row.question_id),
        questionType: String(row.question_type) as QuestionType,
        optionId: row.option_id ? String(row.option_id) : null,
        textValue: row.text_value ? String(row.text_value) : null,
        numberValue:
          row.number_value === null || row.number_value === undefined
            ? null
            : Number(row.number_value),
        flowPath: String(row.flow_path),
        answeredAt: new Date(String(row.answered_at)).toISOString()
      }));

    return {
      submissionId: String(firstRow.submission_id),
      workspaceId: String(firstRow.workspace_id),
      formId: String(firstRow.form_id),
      versionNumber: Number(firstRow.version_number),
      status: String(firstRow.status) as "completed" | "in_progress",
      startedAt: new Date(String(firstRow.started_at)).toISOString(),
      completedAt: firstRow.completed_at
        ? new Date(String(firstRow.completed_at)).toISOString()
        : null,
      branchTrace: safeArray(firstRow.branch_trace_json),
      raw: [], // Not needed for detail view
      facts
    };
  }

  return null;
}

export async function listSubmissionsForForm(
  workspaceId: string,
  formId: string,
  filters: SubmissionFilterInput
) {
  const page = Math.max(1, Number(filters.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(filters.pageSize ?? 25)));

  if (!isSubmissionDbConfigured()) {
    const filtered = Array.from(memorySubmissions.values())
      .filter((entry) => entry.workspaceId === workspaceId && entry.formId === formId)
      .filter((entry) => {
        if (filters.status && entry.status !== filters.status) {
          return false;
        }
        if (filters.version && entry.versionNumber !== filters.version) {
          return false;
        }
        if (filters.dateFrom && Date.parse(entry.startedAt) < Date.parse(filters.dateFrom)) {
          return false;
        }
        if (filters.dateTo && Date.parse(entry.startedAt) > Date.parse(filters.dateTo)) {
          return false;
        }
        if (filters.branchContains) {
          return entry.branchTrace.some((part) => part.includes(filters.branchContains ?? ""));
        }
        return true;
      })
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    return {
      page,
      pageSize,
      total: filtered.length,
      items: paged.map((entry) => ({
        submissionId: entry.submissionId,
        status: entry.status,
        versionNumber: entry.versionNumber,
        startedAt: entry.startedAt,
        completedAt: entry.completedAt,
        branchTrace: [...entry.branchTrace],
        source: "memory"
      }))
    };
  }

  const pools = await getReadableSubmissionPools(workspaceId);
  const merged: Array<Record<string, unknown>> = [];

  for (const poolEntry of pools) {
    const rows = await selectSubmissions(poolEntry.pool, workspaceId, formId, filters);
    rows.forEach((row) => merged.push({ ...row, _source: poolEntry.source }));
  }

  const deduped = new Map<string, Record<string, unknown>>();
  for (const row of merged) {
    const submissionId = String(row.submission_id);
    const existing = deduped.get(submissionId);

    if (!existing) {
      deduped.set(submissionId, row);
      continue;
    }

    const existingCompletedAt = existing.completed_at ? Date.parse(String(existing.completed_at)) : 0;
    const nextCompletedAt = row.completed_at ? Date.parse(String(row.completed_at)) : 0;

    if (nextCompletedAt > existingCompletedAt) {
      deduped.set(submissionId, row);
    }
  }

  const rows = Array.from(deduped.values())
    .filter((row) => {
      if (!filters.branchContains) {
        return true;
      }

      const trace = safeArray(row.branch_trace_json);
      return trace.some((entry) => entry.includes(filters.branchContains ?? ""));
    })
    .sort((a, b) => Date.parse(String(b.started_at)) - Date.parse(String(a.started_at)));

  const start = (page - 1) * pageSize;
  const paged = rows.slice(start, start + pageSize);

  return {
    page,
    pageSize,
    total: rows.length,
    items: paged.map((row) => ({
      submissionId: String(row.submission_id),
      status: String(row.status),
      versionNumber: Number(row.version_number),
      startedAt: new Date(String(row.started_at)).toISOString(),
      completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
      branchTrace: safeArray(row.branch_trace_json),
      source: String(row._source ?? "platform")
    }))
  };
}

export async function exportSubmissionsCsv(
  workspaceId: string,
  formId: string,
  mode: "wide" | "facts" = "wide",
  schemaVersions: ExportSchemaVersion[] = []
) {
  const labelIndicesByVersion = buildLabelIndexByVersion(schemaVersions);
  const fallbackLabelIndex = pickFallbackLabelIndex(schemaVersions, labelIndicesByVersion);
  const labelIndices = Array.from(labelIndicesByVersion.values());

  if (!isSubmissionDbConfigured()) {
    const submissions = Array.from(memorySubmissions.values()).filter(
      (entry) => entry.workspaceId === workspaceId && entry.formId === formId
    );

    if (mode === "facts") {
      const headers = [
        "submissionId",
        "status",
        "versionNumber",
        "questionLabel",
        "answer",
        "questionId",
        "questionType",
        "optionLabel",
        "optionId",
        "textValue",
        "numberValue",
        "flowPath",
        "flowPathLabel",
        "answeredAt"
      ];

      const rows = submissions.flatMap((submission) =>
        submission.facts.map((fact) => {
          const labelIndex =
            resolveLabelIndexForVersion(
              submission.versionNumber,
              labelIndicesByVersion,
              fallbackLabelIndex
            ) ?? null;

          const optionLabel = labelIndex
            ? getOptionContext(labelIndex, fact.questionId, fact.optionId ?? "")?.optionLabel ?? ""
            : "";

          return [
            submission.submissionId,
            submission.status,
            String(submission.versionNumber),
            getDisplayQuestionLabel(fact.questionId, labelIndices, labelIndex),
            formatFactValueForExport(fact, labelIndex),
            fact.questionId,
            fact.questionType,
            optionLabel,
            fact.optionId ?? "",
            fact.textValue ?? "",
            fact.numberValue ?? "",
            fact.flowPath,
            formatFlowPathForExport(fact.flowPath, labelIndex),
            fact.answeredAt
          ];
        })
      );

      return toCsv(headers, rows);
    }

    const questionIds = Array.from(
      new Set(submissions.flatMap((submission) => submission.facts.map((fact) => fact.questionId)))
    ).sort();
    const questionHeaders = buildQuestionHeaders(questionIds, labelIndices);

    const headers = [
      "submissionId",
      "status",
      "versionNumber",
      "startedAt",
      "completedAt",
      "branchTrace",
      ...questionIds.map((questionId) => questionHeaders.get(questionId) ?? questionId)
    ];

    const rows = submissions
      .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
      .map((submission) => {
        const byQuestion = new Map<string, string[]>();
        const labelIndex =
          resolveLabelIndexForVersion(
            submission.versionNumber,
            labelIndicesByVersion,
            fallbackLabelIndex
          ) ?? null;

        submission.facts.forEach((fact) => {
          const existing = byQuestion.get(fact.questionId) ?? [];
          existing.push(formatFactValueForExport(fact, labelIndex));
          byQuestion.set(fact.questionId, existing);
        });

        return [
          submission.submissionId,
          submission.status,
          String(submission.versionNumber),
          submission.startedAt,
          submission.completedAt ?? "",
          formatBranchTraceForExport(submission.branchTrace, labelIndex),
          ...questionIds.map((questionId) => (byQuestion.get(questionId) ?? []).join(" | "))
        ];
      });

    return toCsv(headers, rows);
  }

  const pools = await getReadableSubmissionPools(workspaceId);

  const submissions = new Map<
    string,
    {
      submissionId: string;
      versionNumber: number;
      startedAt: string;
      completedAt: string | null;
      status: string;
      branchTrace: string[];
    }
  >();
  const facts: Array<{
    submissionId: string;
    questionId: string;
    questionType: string;
    optionId: string | null;
    textValue: string | null;
    numberValue: number | null;
    flowPath: string;
    answeredAt: string;
  }> = [];

  for (const poolEntry of pools) {
    const [submissionRows] = await poolEntry.pool.execute<RowDataPacket[]>(
      `
        SELECT submission_id, version_number, started_at, completed_at, status, branch_trace_json
        FROM submissions
        WHERE workspace_id = ? AND form_id = ?
      `,
      [workspaceId, formId]
    );

    for (const row of submissionRows) {
      const submissionId = String(row.submission_id);
      if (!submissions.has(submissionId)) {
        submissions.set(submissionId, {
          submissionId,
          versionNumber: Number(row.version_number),
          startedAt: new Date(String(row.started_at)).toISOString(),
          completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
          status: String(row.status),
          branchTrace: safeArray(row.branch_trace_json)
        });
      }
    }

    const [factRows] = await poolEntry.pool.execute<RowDataPacket[]>(
      `
        SELECT
          af.submission_id,
          af.question_id,
          af.question_type,
          af.option_id,
          af.text_value,
          af.number_value,
          af.flow_path,
          af.answered_at
        FROM answer_facts af
        JOIN submissions s ON s.submission_id = af.submission_id
        WHERE s.workspace_id = ? AND s.form_id = ?
      `,
      [workspaceId, formId]
    );

    factRows.forEach((row) => {
      facts.push({
        submissionId: String(row.submission_id),
        questionId: String(row.question_id),
        questionType: String(row.question_type),
        optionId: row.option_id ? String(row.option_id) : null,
        textValue: row.text_value ? String(row.text_value) : null,
        numberValue:
          row.number_value === null || row.number_value === undefined
            ? null
            : Number(row.number_value),
        flowPath: String(row.flow_path),
        answeredAt: new Date(String(row.answered_at)).toISOString()
      });
    });
  }

  if (mode === "facts") {
    const headers = [
      "submissionId",
      "status",
      "versionNumber",
      "questionLabel",
      "answer",
      "questionId",
      "questionType",
      "optionLabel",
      "optionId",
      "textValue",
      "numberValue",
      "flowPath",
      "flowPathLabel",
      "answeredAt"
    ];

    const rows = facts.map((fact) => {
      const submission = submissions.get(fact.submissionId);
      const versionNumber = submission?.versionNumber ?? 0;
      const labelIndex =
        resolveLabelIndexForVersion(versionNumber, labelIndicesByVersion, fallbackLabelIndex) ?? null;
      const optionLabel = labelIndex
        ? getOptionContext(labelIndex, fact.questionId, fact.optionId ?? "")?.optionLabel ?? ""
        : "";

      return [
        fact.submissionId,
        submission?.status ?? "",
        versionNumber ? String(versionNumber) : "",
        getDisplayQuestionLabel(fact.questionId, labelIndices, labelIndex),
        formatFactValueForExport(fact, labelIndex),
        fact.questionId,
        fact.questionType,
        optionLabel,
        fact.optionId ?? "",
        fact.textValue ?? "",
        fact.numberValue ?? "",
        fact.flowPath,
        formatFlowPathForExport(fact.flowPath, labelIndex),
        fact.answeredAt
      ];
    });

    return toCsv(headers, rows);
  }

  const questionIds = Array.from(new Set(facts.map((fact) => fact.questionId))).sort();
  const questionHeaders = buildQuestionHeaders(questionIds, labelIndices);
  const headers = [
    "submissionId",
    "status",
    "versionNumber",
    "startedAt",
    "completedAt",
    "branchTrace",
    ...questionIds.map((questionId) => questionHeaders.get(questionId) ?? questionId)
  ];

  const rows = Array.from(submissions.values())
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .map((submission) => {
      const byQuestion = new Map<string, string[]>();
      const labelIndex =
        resolveLabelIndexForVersion(
          submission.versionNumber,
          labelIndicesByVersion,
          fallbackLabelIndex
        ) ?? null;

      facts
        .filter((fact) => fact.submissionId === submission.submissionId)
        .forEach((fact) => {
          const existing = byQuestion.get(fact.questionId) ?? [];
          existing.push(formatFactValueForExport(fact, labelIndex));
          byQuestion.set(fact.questionId, existing);
        });

      return [
        submission.submissionId,
        submission.status,
        String(submission.versionNumber),
        submission.startedAt,
        submission.completedAt ?? "",
        formatBranchTraceForExport(submission.branchTrace, labelIndex),
        ...questionIds.map((questionId) => (byQuestion.get(questionId) ?? []).join(" | "))
      ];
    });

  return toCsv(headers, rows);
}

interface ExportFactLike {
  questionId: string;
  optionId: string | null;
  textValue: string | null;
  numberValue: number | null;
  flowPath: string;
}

function buildLabelIndexByVersion(schemaVersions: ExportSchemaVersion[]) {
  const byVersion = new Map<number, SchemaLabelIndex>();

  schemaVersions.forEach((version) => {
    byVersion.set(version.versionNumber, buildSchemaLabelIndex(version.schema));
  });

  return byVersion;
}

function pickFallbackLabelIndex(
  schemaVersions: ExportSchemaVersion[],
  byVersion: Map<number, SchemaLabelIndex>
) {
  const latest = [...schemaVersions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
  if (!latest) {
    return null;
  }

  return byVersion.get(latest.versionNumber) ?? null;
}

function resolveLabelIndexForVersion(
  versionNumber: number,
  byVersion: Map<number, SchemaLabelIndex>,
  fallback: SchemaLabelIndex | null
) {
  return byVersion.get(versionNumber) ?? fallback;
}

function getDisplayQuestionLabel(
  questionId: string,
  allIndices: SchemaLabelIndex[],
  preferredIndex: SchemaLabelIndex | null
) {
  if (preferredIndex) {
    const preferred = getQuestionLabel(preferredIndex, questionId);
    if (preferred !== questionId) {
      return preferred;
    }
  }

  for (const index of allIndices) {
    const label = getQuestionLabel(index, questionId);
    if (label !== questionId) {
      return label;
    }
  }

  return questionId;
}

function buildQuestionHeaders(questionIds: string[], allIndices: SchemaLabelIndex[]) {
  const labelByQuestionId = new Map<string, string>();
  const counts = new Map<string, number>();

  questionIds.forEach((questionId) => {
    const label = getDisplayQuestionLabel(questionId, allIndices, null);
    labelByQuestionId.set(questionId, label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  const headers = new Map<string, string>();
  questionIds.forEach((questionId) => {
    const label = labelByQuestionId.get(questionId) ?? questionId;
    if ((counts.get(label) ?? 0) > 1) {
      headers.set(questionId, `${label} (${questionId})`);
      return;
    }
    headers.set(questionId, label);
  });

  return headers;
}

function formatFactValueForExport(fact: ExportFactLike, labelIndex: SchemaLabelIndex | null) {
  if (fact.numberValue !== null && fact.numberValue !== undefined) {
    return String(fact.numberValue);
  }

  if (labelIndex && fact.optionId) {
    const optionLabel = getOptionContext(labelIndex, fact.questionId, fact.optionId)?.optionLabel;
    if (optionLabel) {
      return optionLabel;
    }
  }

  if (fact.textValue !== null && fact.textValue !== undefined) {
    return fact.textValue;
  }

  return fact.optionId ?? "";
}

function formatBranchTraceForExport(trace: string[], labelIndex: SchemaLabelIndex | null) {
  if (!trace.length) {
    return "";
  }

  const readable = labelIndex ? describeBranchTrace(trace, labelIndex) : trace;
  return readable.join(" > ");
}

function formatFlowPathForExport(flowPath: string, labelIndex: SchemaLabelIndex | null) {
  const pathSegments = flowPath.split("/").filter(Boolean);
  if (pathSegments.length === 0) {
    return "";
  }

  if (!labelIndex) {
    return pathSegments.join(" > ");
  }

  const readable = describeFlowPath(pathSegments, labelIndex).map((entry) =>
    formatQuestionOption(entry.questionLabel, entry.optionLabel)
  );

  return readable.join(" > ");
}

async function selectSubmissions(
  pool: Pool,
  workspaceId: string,
  formId: string,
  filters: SubmissionFilterInput
) {
  const clauses = ["workspace_id = ?", "form_id = ?"];
  const params: Array<string | number> = [workspaceId, formId];

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

  const [rows] = await pool.execute<RowDataPacket[]>(
    `
      SELECT submission_id, version_number, started_at, completed_at, status, branch_trace_json
      FROM submissions
      WHERE ${clauses.join(" AND ")}
      ORDER BY started_at DESC
      LIMIT 1000
    `,
    params
  );

  return rows;
}

function safeArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry));
      }
    } catch {
      return value ? [value] : [];
    }
  }

  return [];
}

function toCsv(headers: string[], rows: Array<Array<string | number>>) {
  const escapeCell = (value: string | number) => {
    const raw = String(value ?? "");
    const text = shouldNeutralizeCsvCell(raw) ? `'${raw}` : raw;

    if (text.includes(",") || text.includes("\n") || text.includes("\"")) {
      return `"${text.replaceAll("\"", "\"\"")}"`;
    }

    return text;
  };

  const headerLine = headers.map(escapeCell).join(",");
  const rowLines = rows.map((row) => row.map(escapeCell).join(","));

  return [headerLine, ...rowLines].join("\n");
}

function shouldNeutralizeCsvCell(value: string) {
  if (!value) {
    return false;
  }

  const first = value[0];
  return first === "=" || first === "+" || first === "-" || first === "@" || first === "\t" || first === "\r";
}

async function runWithRetries<T>(work: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
    }
  }

  throw lastError;
}

function hydrateMemorySubmissionsFromDisk() {
  const stored = readLocalJson<SerializedMemorySubmissions>(SUBMISSION_STORE_STATE_KEY);
  if (!stored) {
    return;
  }

  try {
    stored.forEach(([submissionId, submission]) => {
      memorySubmissions.set(submissionId, submission);
    });
  } catch {
    // Ignore malformed persisted data.
  }
}

function persistMemorySubmissionsToDisk() {
  writeLocalJson(SUBMISSION_STORE_STATE_KEY, Array.from(memorySubmissions.entries()));
}

function nowIso() {
  return new Date().toISOString();
}
