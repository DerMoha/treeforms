import { NextRequest } from "next/server";

import {
  computeRuntimeCursor,
  findFirstUnanswered,
  findQuestionInSequence,
  reconcileAnswers,
  setAnswer,
  RuntimeValidationError
} from "@/lib/engine";
import { getSession, updateSessionState } from "@/lib/db/app-store";
import { getPublishedSchemaByFormAndVersion } from "@/lib/server/forms";
import { jsonError, jsonOk, readJson } from "@/lib/server/http";
import { buildRuntimePayload } from "@/lib/server/runtime";

interface SaveAnswerInput {
  questionId?: string;
  value?: unknown;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionToken: string }> }
) {
  try {
    const { sessionToken } = await context.params;
    const session = await getSession(sessionToken);

    if (!session) {
      return jsonError("Session not found", 404);
    }

    if (session.status === "completed") {
      return jsonError("Session is already completed", 409);
    }

    const published = await getPublishedSchemaByFormAndVersion(session.formId, session.versionNumber);

    if (!published) {
      return jsonError("Published form version not found", 404);
    }

    const body = await readJson<SaveAnswerInput>(request);
    const questionId = body.questionId;

    if (!questionId) {
      return jsonError("questionId is required", 400);
    }

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
    const clearingAnswer = body.value === null;

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
          body.value,
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
    return jsonError("Unable to save answer", 500, String(error));
  }
}
