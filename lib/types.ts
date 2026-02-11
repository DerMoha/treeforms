export type QuestionType = "radio" | "checkbox" | "text" | "number";

export interface FormSchema {
  schemaVersion: 1;
  formId: string;
  title: string;
  mainFlow: Flow;
}

export interface Flow {
  flowId: string;
  questions: QuestionNode[];
}

export interface QuestionValidation {
  min?: number;
  max?: number;
  minLen?: number;
  maxLen?: number;
}

export interface QuestionNode {
  questionId: string;
  type: QuestionType;
  label: string;
  required: boolean;
  options?: OptionNode[];
  validation?: QuestionValidation;
}

export interface OptionNode {
  optionId: string;
  label: string;
  value: string;
  branch?: Flow;
}

export type AnswerValue = string | number | string[];

export interface StoredAnswer {
  questionId: string;
  value: AnswerValue;
  answeredAt: string;
  flowPath: string[];
}

export interface RuntimeQuestion {
  question: QuestionNode;
  index: number;
  flowPath: string[];
}

export interface RuntimeCursor {
  questions: RuntimeQuestion[];
  currentQuestionId: string | null;
}

export interface DbTargetInput {
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  databaseName: string;
}

export interface DbTargetConfig {
  id: string;
  workspaceId: string;
  name: string;
  host: string;
  port: number;
  user: string;
  passwordEncrypted: string;
  databaseName: string;
  isActive: boolean;
  status: "healthy" | "unhealthy" | "unknown";
  lastError?: string | null;
  lastTestedAt?: string | null;
}

export interface FormRecord {
  formId: string;
  workspaceId: string;
  slug: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormVersionRecord {
  id: string;
  formId: string;
  versionNumber: number;
  schemaJson: string;
  publishedAt: string;
}

export interface DraftRecord {
  formId: string;
  schemaJson: string;
  updatedAt: string;
}

export interface SessionState {
  sessionToken: string;
  resumeToken: string;
  workspaceId: string;
  formId: string;
  versionNumber: number;
  status: "in_progress" | "completed";
  currentQuestionId: string | null;
  answers: Record<string, StoredAnswer>;
  history: string[];
  branchTrace: string[];
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionRecord {
  submissionId: string;
  workspaceId: string;
  formId: string;
  versionNumber: number;
  status: "in_progress" | "completed";
  startedAt: string;
  completedAt: string | null;
  branchTraceJson: string;
}

export interface AnswerFact {
  questionId: string;
  questionType: QuestionType;
  optionId: string | null;
  textValue: string | null;
  numberValue: number | null;
  flowPath: string;
  answeredAt: string;
}

export interface AnswerRaw {
  questionId: string;
  answerJson: string;
  answeredAt: string;
  flowPath: string;
}
