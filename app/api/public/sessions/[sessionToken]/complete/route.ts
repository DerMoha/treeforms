import { NextRequest } from "next/server";

import { computeRuntimeCursor, reconcileAnswers } from "@/lib/engine";
import { getSession, isSessionExpired, markSessionCompleted } from "@/lib/db/app-store";
import { persistCompletedSubmission } from "@/lib/db/submission-store";
import { getPublishedSchemaByFormAndVersion } from "@/lib/server/forms";
import { applyRateLimit } from "@/lib/server/rate-limit";
import { handleRouteError, jsonError, jsonOk } from "@/lib/server/http";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionToken: string }> }
) {
  try {
    const rateLimit = applyRateLimit(request, {
      scope: "public.session.complete",
      limit: 60,
      windowMs: 60_000
    });

    if (!rateLimit.allowed) {
      return jsonError("Rate limit exceeded", 429, null, {
        headers: {
          "retry-after": String(rateLimit.retryAfterSeconds)
        }
      });
    }

    const { sessionToken } = await context.params;
    const session = await getSession(sessionToken);

    if (!session) {
      return jsonError("Session not found", 404);
    }

    if (isSessionExpired(session)) {
      return jsonError("Session expired", 410);
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
    return handleRouteError("Unable to complete session", error);
  }
}
