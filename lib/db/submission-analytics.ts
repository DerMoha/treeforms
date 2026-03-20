import {
  buildSchemaLabelIndex,
  describeBranchTrace,
  describeFlowPath,
  formatQuestionOption,
  getOptionContext,
  getQuestionLabel,
  type SchemaLabelIndex
} from "@/lib/label-index";
import { type FormSchema, type QuestionType } from "@/lib/types";
import { getStorage } from "@/lib/db/storage";
import { listVersions } from "@/lib/db/form-store";
import { type AnswerFactRecord, type SubmissionExportRecord } from "@/lib/db/storage/interface";

export interface SubmissionSummaryResponse {
  generatedAt: string;
  selectedVersion: number | null;
  availableVersions: Array<{
    versionNumber: number;
    publishedAt: string;
  }>;
  overview: {
    total: number;
    completed: number;
    inProgress: number;
    completionRate: number;
  };
  questions: QuestionSummary[];
  flows: FlowSummary;
}

export interface QuestionSummary {
  questionId: string;
  questionLabel: string;
  questionType: QuestionType;
  respondents: number;
  answers: AnswerSummary[];
}

export interface AnswerSummary {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

export interface FlowSummary {
  topPaths: PathSummary[];
  topBranches: BranchSummary[];
}

export interface PathSummary {
  pathKey: string;
  pathLabel: string[];
  count: number;
  percentage: number;
}

export interface BranchSummary {
  branchKey: string;
  branchLabel: string;
  count: number;
  percentage: number;
}

export async function buildSubmissionSummary(
  workspaceId: string,
  formId: string,
  filters: {
    version?: number | null;
    status?: "completed" | "in_progress" | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  }
): Promise<SubmissionSummaryResponse> {
  const [allSubmissions, allVersions] = await Promise.all([
    (await getStorage()).submissions.listSubmissionExports(workspaceId, formId),
    listVersions(formId)
  ]);

  const availableVersions = allVersions.map((v) => ({
    versionNumber: v.versionNumber,
    publishedAt: v.publishedAt
  }));

  const latestVersion = availableVersions.length > 0
    ? availableVersions[0].versionNumber
    : null;

  const selectedVersion = filters.version ?? latestVersion;

  const labelIndicesByVersion = buildLabelIndexMap(allVersions);

  const fallbackLabelIndex = latestVersion != null
    ? labelIndicesByVersion.get(latestVersion) ?? null
    : null;

  let submissions = allSubmissions;

  if (selectedVersion != null) {
    submissions = submissions.filter((s) => s.versionNumber === selectedVersion);
  }

  if (filters.status) {
    submissions = submissions.filter((s) => s.status === filters.status);
  }

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    submissions = submissions.filter((s) => new Date(s.startedAt) >= from);
  }

  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    submissions = submissions.filter((s) => new Date(s.startedAt) <= to);
  }

  const total = submissions.length;
  const completed = submissions.filter((s) => s.status === "completed").length;
  const inProgress = total - completed;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const labelIndex = selectedVersion != null
    ? labelIndicesByVersion.get(selectedVersion) ?? fallbackLabelIndex
    : fallbackLabelIndex;

  const questionSummaries = buildQuestionSummaries(submissions, labelIndex);
  const flowSummary = buildFlowSummary(submissions, labelIndex);

  return {
    generatedAt: new Date().toISOString(),
    selectedVersion,
    availableVersions,
    overview: { total, completed, inProgress, completionRate },
    questions: questionSummaries,
    flows: flowSummary
  };
}

function buildLabelIndexMap(
  versions: Array<{ versionNumber: number; schemaJson: string }>
): Map<number, SchemaLabelIndex> {
  const map = new Map<number, SchemaLabelIndex>();
  for (const v of versions) {
    try {
      const schema = JSON.parse(v.schemaJson) as FormSchema;
      map.set(v.versionNumber, buildSchemaLabelIndex(schema));
    } catch {
      // skip versions with unparseable schema
    }
  }
  return map;
}

function buildQuestionSummaries(
  submissions: SubmissionExportRecord[],
  labelIndex: SchemaLabelIndex | null
): QuestionSummary[] {
  const byQuestion = new Map<string, QuestionAggregation>();

  for (const submission of submissions) {
    for (const fact of submission.facts) {
      if (fact.questionType === "text" || fact.questionType === "number") {
        continue;
      }

      if (!byQuestion.has(fact.questionId)) {
        byQuestion.set(fact.questionId, {
          questionId: fact.questionId,
          questionType: fact.questionType,
          answers: new Map<string, number>()
        });
      }

      const agg = byQuestion.get(fact.questionId)!;

      if (fact.questionType === "radio") {
        const key = fact.optionId ?? "";
        agg.answers.set(key, (agg.answers.get(key) ?? 0) + 1);
      } else if (fact.questionType === "checkbox") {
        if (fact.textValue) {
          const optionIds = fact.textValue.split(",").map((id) => id.trim()).filter(Boolean);
          for (const oid of optionIds) {
            agg.answers.set(oid, (agg.answers.get(oid) ?? 0) + 1);
          }
        }
      }
    }
  }

  const summaries: QuestionSummary[] = [];

  for (const [questionId, agg] of byQuestion) {
    const respondents = submissions.filter((s) =>
      s.facts.some((f) => f.questionId === questionId)
    ).length;

    const answers: AnswerSummary[] = [];

    for (const [key, count] of agg.answers) {
      let label = key;
      if (labelIndex && key) {
        const ctx = getOptionContext(labelIndex, questionId, key);
        if (ctx) {
          label = ctx.optionLabel;
        }
      }

      answers.push({
        key,
        label,
        count,
        percentage: respondents > 0 ? Math.round((count / respondents) * 100) : 0
      });
    }

    answers.sort((a, b) => b.count - a.count);

    const questionLabel = labelIndex
      ? getQuestionLabel(labelIndex, questionId)
      : questionId;

    summaries.push({
      questionId,
      questionLabel,
      questionType: agg.questionType,
      respondents,
      answers
    });
  }

  summaries.sort((a, b) => a.questionLabel.localeCompare(b.questionLabel));

  return summaries;
}

interface QuestionAggregation {
  questionId: string;
  questionType: QuestionType;
  answers: Map<string, number>;
}

function buildFlowSummary(
  submissions: SubmissionExportRecord[],
  labelIndex: SchemaLabelIndex | null
): FlowSummary {
  const pathCounts = new Map<string, { label: string[]; count: number }>();
  const branchCounts = new Map<string, { label: string; count: number }>();

  for (const submission of submissions) {
    const trace = submission.branchTrace;

    if (trace.length > 0) {
      const pathKey = trace.join("|");
      const existing = pathCounts.get(pathKey);
      if (existing) {
        existing.count++;
      } else {
        const readable = labelIndex ? describeBranchTrace(trace, labelIndex) : trace;
        pathCounts.set(pathKey, { label: readable, count: 1 });
      }
    }

    for (const entry of trace) {
      const [questionId, optionId] = entry.split(":");
      if (!questionId || !optionId) continue;

      let branchLabel = optionId;
      if (labelIndex) {
        const ctx = getOptionContext(labelIndex, questionId, optionId);
        if (ctx) {
          branchLabel = formatQuestionOption(ctx.questionLabel, ctx.optionLabel);
        }
      }

      const existing = branchCounts.get(optionId);
      if (existing) {
        existing.count++;
      } else {
        branchCounts.set(optionId, { label: branchLabel, count: 1 });
      }
    }
  }

  const total = submissions.length;

  const topPaths: PathSummary[] = Array.from(pathCounts.entries())
    .map(([pathKey, { label, count }]) => ({
      pathKey,
      pathLabel: label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topBranches: BranchSummary[] = Array.from(branchCounts.entries())
    .map(([branchKey, { label, count }]) => ({
      branchKey,
      branchLabel: label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { topPaths, topBranches };
}
