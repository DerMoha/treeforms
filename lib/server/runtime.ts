import {
  computeRuntimeCursor,
  findQuestionInSequence,
  findFirstUnanswered,
  reconcileAnswers
} from "@/lib/engine";
import { type FormSchema, type SessionState } from "@/lib/types";

export function buildRuntimePayload(schema: FormSchema, session: SessionState) {
  const reconciled = reconcileAnswers(schema, session.answers);
  const cursor = computeRuntimeCursor(schema, reconciled.answers, session.currentQuestionId);
  const currentQuestion = findQuestionInSequence(cursor.questions, cursor.currentQuestionId);

  const answeredCount = Object.keys(reconciled.answers).length;
  const totalCount = cursor.questions.length;

  return {
    sessionToken: session.sessionToken,
    resumeToken: session.resumeToken,
    status: session.status,
    currentQuestion: currentQuestion
      ? {
          question: currentQuestion.question,
          flowPath: currentQuestion.flowPath,
          index: currentQuestion.index
        }
      : null,
    nextUnansweredQuestionId: findFirstUnanswered(cursor.questions, reconciled.answers),
    answeredCount,
    totalCount,
    branchTrace: reconciled.branchTrace,
    answers: reconciled.answers,
    questions: cursor.questions.map((entry) => ({
      questionId: entry.question.questionId,
      label: entry.question.label,
      index: entry.index,
      flowPath: entry.flowPath
    }))
  };
}
