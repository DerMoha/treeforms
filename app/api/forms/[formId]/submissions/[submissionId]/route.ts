import { NextRequest } from "next/server";

import { getFormById, getVersionByFormAndNumber } from "@/lib/db/app-store";
import { getSubmissionById } from "@/lib/db/submission-store";
import { buildSchemaLabelIndex, getQuestionLabel, describeBranchTrace, getOptionContext } from "@/lib/label-index";
import { handleRouteError, jsonError, jsonOk, workspaceIdFromRequest } from "@/lib/server/http";
import { type FormSchema, type QuestionType } from "@/lib/types";

interface AnswerFact {
  questionId: string;
  questionType: QuestionType;
  optionId: string | null;
  textValue: string | null;
  numberValue: number | null;
  flowPath: string;
  answeredAt: string;
}

interface GroupedAnswer {
  groupName: string;
  answers: Array<{
    questionLabel: string;
    answer: string;
  }>;
}

interface SubmissionDetailResponse {
  submissionId: string;
  status: "completed" | "in_progress";
  versionNumber: number;
  startedAt: string;
  completedAt: string | null;
  source: string;
  branchTrace: string[];
  branchTraceReadable: string[];
  groupedAnswers: GroupedAnswer[];
}

function formatAnswerValue(fact: AnswerFact, labelIndex: ReturnType<typeof buildSchemaLabelIndex>): string {
  switch (fact.questionType) {
    case "radio": {
      if (fact.optionId) {
        const ctx = getOptionContext(labelIndex, fact.questionId, fact.optionId);
        if (ctx) {
          return ctx.optionLabel;
        }
      }
      return fact.textValue ?? "-";
    }
    case "checkbox": {
      // For checkbox, textValue contains comma-separated optionIds
      if (fact.textValue) {
        const optionIds = fact.textValue.split(",").map((id: string) => id.trim());
        const labels = optionIds.map((oid: string) => {
          const ctx = getOptionContext(labelIndex, fact.questionId, oid);
          return ctx?.optionLabel ?? oid;
        });
        return labels.join(", ");
      }
      return "-";
    }
    case "text":
      return fact.textValue ?? "-";
    case "number":
      return fact.numberValue?.toString() ?? "-";
    default:
      return "-";
  }
}

function groupAnswersByFlowPath(
  facts: AnswerFact[],
  labelIndex: ReturnType<typeof buildSchemaLabelIndex>,
  branchTrace: string[]
): GroupedAnswer[] {
  const groups = new Map<string, GroupedAnswer>();
  
  // Create a map of flowPath to branch trace description for branch flows
  const flowPathToBranchDesc = new Map<string, string>();
  branchTrace.forEach((trace, index) => {
    const parts = trace.split(":");
    if (parts.length === 2) {
      const [questionId, optionId] = parts;
      const ctx = getOptionContext(labelIndex, questionId, optionId);
      if (ctx) {
        flowPathToBranchDesc.set(optionId, `Branch: ${ctx.optionLabel}`);
      }
    }
  });

  for (const fact of facts) {
    const flowPathParts = fact.flowPath.split("/").filter((p: string) => p);
    let groupName = "Main Flow";

    if (flowPathParts.length > 0) {
      // Check if this is a branch flow
      const lastPart = flowPathParts[flowPathParts.length - 1];
      const branchDesc = flowPathToBranchDesc.get(lastPart);
      if (branchDesc) {
        groupName = branchDesc;
      } else {
        // Build path from flow parts
        const pathLabels = flowPathParts.map((part: string) => {
          const ctx = getOptionContext(labelIndex, fact.questionId, part);
          return ctx?.optionLabel ?? part;
        });
        groupName = pathLabels.join(" → ");
      }
    }

    if (!groups.has(groupName)) {
      groups.set(groupName, { groupName, answers: [] });
    }

    const questionLabel = getQuestionLabel(labelIndex, fact.questionId);
    const answerValue = formatAnswerValue(fact, labelIndex);
    
    groups.get(groupName)!.answers.push({
      questionLabel,
      answer: answerValue
    });
  }

  // Sort groups: Main Flow first, then by name
  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    if (a.groupName === "Main Flow") return -1;
    if (b.groupName === "Main Flow") return 1;
    return a.groupName.localeCompare(b.groupName);
  });

  return sortedGroups;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ formId: string; submissionId: string }> }
) {
  try {
    const workspaceId = workspaceIdFromRequest(request);
    const { formId, submissionId } = await context.params;
    
    const form = await getFormById(formId);
    if (!form || form.workspaceId !== workspaceId) {
      return jsonError("Form not found", 404);
    }

    const submission = await getSubmissionById(workspaceId, formId, submissionId);
    if (!submission) {
      return jsonError("Submission not found", 404);
    }

    // Get the schema for this submission version to build label index
    const version = await getVersionByFormAndNumber(formId, submission.versionNumber);
    if (!version) {
      return jsonError("Form version not found", 404);
    }

    const schema = JSON.parse(version.schemaJson) as FormSchema;
    const labelIndex = buildSchemaLabelIndex(schema);

    // Build readable branch trace
    const branchTraceReadable = describeBranchTrace(submission.branchTrace, labelIndex);

    // Group answers by flow path
    const facts = submission.facts as AnswerFact[];
    const groupedAnswers = groupAnswersByFlowPath(facts, labelIndex, submission.branchTrace);

    const response: SubmissionDetailResponse = {
      submissionId: submission.submissionId,
      status: submission.status,
      versionNumber: submission.versionNumber,
      startedAt: submission.startedAt,
      completedAt: submission.completedAt,
      source: submission.workspaceId === "memory" ? "memory" : "platform",
      branchTrace: submission.branchTrace,
      branchTraceReadable,
      groupedAnswers
    };

    return jsonOk(response);
  } catch (error) {
    return handleRouteError("Unable to get submission details", error);
  }
}
