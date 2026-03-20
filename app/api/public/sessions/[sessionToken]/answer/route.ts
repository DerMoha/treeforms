import { NextRequest } from "next/server";

import {
  computeRuntimeCursor,
  findFirstUnanswered,
  findQuestionInSequence,
  reconcileAnswers,
  setAnswer,
  RuntimeValidationError
} from "@/lib/engine";
import { getSession, isSessionExpired, updateSessionState } from "@/lib/db/app-store";
import { getPublishedSchemaByFormAndVersion } from "@/lib/server/forms";
import { applyRateLimit } from "@/lib/server/rate-limit";
import { buildRuntimePayload } from "@/lib/server/runtime";
import { saveAnswerInputSchema } from "@/lib/server/validation";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/server/http";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionToken: string }> }
) {
  try {
    const rateLimit = applyRateLimit(request, {
      scope: "public.session.answer",
      limit: 120,
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

    if (await isSessionExpired(session)) {
      return jsonError("Session expired", 410);
    }

    if (session.status === "completed") {
      return jsonError("Session is already completed", 409);
    }

    const published = await getPublishedSchemaByFormAndVersion(session.formId, session.versionNumber);

    if (!published) {
      return jsonError("Published form version not found", 404);
    }

    const rawBody = await readJson<unknown>(request, {
      maxBytes: 32 * 1024
    });
    const body = saveAnswerInputSchema.safeParse(rawBody);

    if (!body.success) {
      return jsonError("Invalid answer payload", 400, body.error.flatten());
    }

    const questionId = body.data.questionId;

    const reconciledBefore = reconcileAnswers(published.schema, session.answers);
    const cursor = computeRuntimeCursor(
      published.schema,
      reconciledBefore.answers,
      session.currentQuestionId
    );
    const activeQuestion = findQuestionInSequence(cursor.questions, cursor.currentQuestionId);

    if (!activeQuestion) {
      return jsonError("No active question to answer", 409);
    }

    if (activeQuestion.question.questionId !== questionId) {
      return jsonError("Answer must target the current active question", 409);
    }

    let nextAnswers;
    const clearingAnswer = body.data.value === null;

    if (clearingAnswer) {
      if (activeQuestion.question.required) {
        return jsonError("Required question cannot be cleared", 422);
      }

      nextAnswers = { ...reconciledBefore.answers };
      delete nextAnswers[questionId];
    } else {
      try {
        nextAnswers = setAnswer(
          published.schema,
          reconciledBefore.answers,
          activeQuestion.question,
          body.data.value,
          activeQuestion.flowPath
        );
      } catch (error) {
        if (error instanceof RuntimeValidationError) {
          return jsonError(error.message, 422);
        }
        throw error;
      }
    }

    const reconciledAfter = reconcileAnswers(published.schema, nextAnswers);
    const prunedAnswers =
      Object.keys(nextAnswers).length - Object.keys(reconciledAfter.answers).length;
    const nextCursor = computeRuntimeCursor(
      published.schema,
      reconciledAfter.answers,
      activeQuestion.question.questionId
    );

    const currentIndex = nextCursor.questions.findIndex(
      (entry) => entry.question.questionId === activeQuestion.question.questionId
    );

    const nextQuestionId =
      findFirstUnanswered(nextCursor.questions, reconciledAfter.answers, currentIndex + 1) ?? null;

    const history = [...session.history];
    if (nextQuestionId && history[history.length - 1] !== nextQuestionId) {
      history.push(nextQuestionId);
    }

    await updateSessionState({
      sessionToken,
      currentQuestionId: nextQuestionId,
      answersJson: JSON.stringify(reconciledAfter.answers),
      historyJson: JSON.stringify(history),
      branchTraceJson: JSON.stringify(reconciledAfter.branchTrace)
    });

    const responseSession = {
      ...session,
      answers: reconciledAfter.answers,
      history,
      currentQuestionId: nextQuestionId,
      branchTrace: reconciledAfter.branchTrace
    };

    return jsonOk({
      runtime: buildRuntimePayload(published.schema, responseSession),
      meta: {
        prunedAnswers,
        completed: nextQuestionId === null
      }
    });
  } catch (error) {
    return handleRouteError("Unable to save answer", error);
  }
}
