import { computeRuntimeCursor, reconcileAnswers } from "@/lib/engine";
import { markSessionCompleted, getSession } from "@/lib/db/app-store";
import { persistCompletedSubmission } from "@/lib/db/submission-store";
import { getPublishedSchemaByFormAndVersion } from "@/lib/server/forms";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function POST(
  _request: Request,
  context: { params: Promise<{ sessionToken: string }> }
) {
  try {
    const { sessionToken } = await context.params;
    const session = await getSession(sessionToken);

    if (!session) {
      return jsonError("Session not found", 404);
    }

    if (session.status === "completed") {
      return jsonOk({
        alreadyCompleted: true,
        submissionId: `sub_${session.sessionToken}`
      });
    }

    const published = await getPublishedSchemaByFormAndVersion(session.formId, session.versionNumber);
    if (!published) {
      return jsonError("Published form version not found", 404);
    }

    const reconciled = reconcileAnswers(published.schema, session.answers);
    const cursor = computeRuntimeCursor(published.schema, reconciled.answers, session.currentQuestionId);

    const missingRequired = cursor.questions
      .filter((entry) => entry.question.required)
      .filter((entry) => !reconciled.answers[entry.question.questionId])
      .map((entry) => entry.question.questionId);

    if (missingRequired.length > 0) {
      return jsonError("Cannot complete while required questions are unanswered", 422, {
        missingRequired
      });
    }

    await markSessionCompleted(sessionToken);

    const completedSession = {
      ...session,
      status: "completed" as const,
      currentQuestionId: null,
      answers: reconciled.answers,
      branchTrace: reconciled.branchTrace
    };

    const stored = await persistCompletedSubmission(completedSession, published.schema);

    return jsonOk({
      completed: true,
      submissionId: stored.submissionId,
      branchTrace: reconciled.branchTrace
    });
  } catch (error) {
    return jsonError("Unable to complete session", 500, String(error));
  }
}
