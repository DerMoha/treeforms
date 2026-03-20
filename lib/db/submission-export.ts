import {
  buildSchemaLabelIndex,
  describeBranchTrace,
  describeFlowPath,
  formatQuestionOption,
  getOptionContext,
  getQuestionLabel,
  type SchemaLabelIndex
} from "@/lib/label-index";
import { type FormSchema } from "@/lib/types";
import { getStorage } from "@/lib/db/storage";
import { toCsv } from "@/lib/utils/csv";

export interface ExportSchemaVersion {
  versionNumber: number;
  schema: FormSchema;
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
  const submissions = await (await getStorage()).submissions.listSubmissionExports(workspaceId, formId);

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
          resolveLabelIndexForVersion(submission.versionNumber, labelIndicesByVersion, fallbackLabelIndex) ??
          null;

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

  const rows = submissions.map((submission) => {
    const byQuestion = new Map<string, string[]>();
    const labelIndex =
      resolveLabelIndexForVersion(submission.versionNumber, labelIndicesByVersion, fallbackLabelIndex) ??
      null;

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
