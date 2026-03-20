import {
  type DraftRecord,
  type FormRecord,
  type FormSchema,
  type FormVersionRecord,
  type QuestionType,
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

export interface AuditEventPayload {
  formId?: string;
  title?: string;
  version?: number;
  name?: string;
}

export interface SubmissionFilterInput {
  status?: string | null;
  version?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  branchContains?: string | null;
  page?: number;
  pageSize?: number;
}

export interface AnswerFactRecord {
  questionId: string;
  questionType: QuestionType;
  optionId: string | null;
  textValue: string | null;
  numberValue: number | null;
  flowPath: string;
  answeredAt: string;
}

export interface SubmissionRecordDetail {
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
  facts: AnswerFactRecord[];
  source: "sqlite" | "mysql";
}

export interface SubmissionListResult {
  page: number;
  pageSize: number;
  total: number;
  items: Array<{
    submissionId: string;
    status: string;
    versionNumber: number;
    startedAt: string;
    completedAt: string | null;
    branchTrace: string[];
    source: "sqlite" | "mysql";
  }>;
}

export interface SubmissionExportRecord {
  submissionId: string;
  versionNumber: number;
  startedAt: string;
  completedAt: string | null;
  status: string;
  branchTrace: string[];
  facts: AnswerFactRecord[];
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

export interface SubmissionStorage {
  persistCompletedSubmission(session: SessionState, schema: FormSchema): Promise<{ submissionId: string }>;
  getSubmissionById(
    workspaceId: string,
    formId: string,
    submissionId: string
  ): Promise<SubmissionRecordDetail | null>;
  listSubmissionsForForm(
    workspaceId: string,
    formId: string,
    filters: SubmissionFilterInput
  ): Promise<SubmissionListResult>;
  listSubmissionExports(workspaceId: string, formId: string): Promise<SubmissionExportRecord[]>;
}

export interface AuditStorage {
  writeEvent(workspaceId: string, actor: string, eventType: string, payload: AuditEventPayload): Promise<void>;
}

export interface Storage {
  forms: FormStorage;
  sessions: SessionStorage;
  submissions: SubmissionStorage;
  audit: AuditStorage;
}
