import {
  computeRuntimeCursor,
  findQuestionInSequence,
  findFirstUnanswered,
  reconcileAnswers
} from "@/lib/engine";
import { buildSchemaLabelIndex, describeBranchTrace, describeFlowPath } from "@/lib/label-index";
import { type FormSchema, type SessionState } from "@/lib/types";

export function buildRuntimePayload(schema: FormSchema, session: SessionState) {
  const reconciled = reconcileAnswers(schema, session.answers);
  const cursor = computeRuntimeCursor(schema, reconciled.answers, session.currentQuestionId);
  const currentQuestion = findQuestionInSequence(cursor.questions, cursor.currentQuestionId);
  const labelIndex = buildSchemaLabelIndex(schema);

  const answeredCount = Object.keys(reconciled.answers).length;
  const totalCount = cursor.questions.length;
  const branchTraceLabels = describeBranchTrace(reconciled.branchTrace, labelIndex);

  return {
    sessionToken: session.sessionToken,
    resumeToken: session.resumeToken,
    status: session.status,
    currentQuestion: currentQuestion
      ? {
          question: currentQuestion.question,
          flowPath: currentQuestion.flowPath,
          flowBreadcrumbs: describeFlowPath(currentQuestion.flowPath, labelIndex).map((entry) => ({
            questionId: entry.questionId,
            questionLabel: entry.questionLabel,
            optionId: entry.optionId,
            optionLabel: entry.optionLabel
          })),
          index: currentQuestion.index
        }
      : null,
    nextUnansweredQuestionId: findFirstUnanswered(cursor.questions, reconciled.answers),
    answeredCount,
    totalCount,
    branchTrace: reconciled.branchTrace,
    branchTraceLabels,
    answers: reconciled.answers,
    questions: cursor.questions.map((entry) => ({
      questionId: entry.question.questionId,
      label: entry.question.label,
      index: entry.index,
      flowPath: entry.flowPath
    }))
  };
}
