import { NextRequest } from "next/server";

import { computeRuntimeCursor, findAdjacentQuestionId, reconcileAnswers } from "@/lib/engine";
import { getSession, updateSessionState } from "@/lib/db/app-store";
import { getPublishedSchemaByFormAndVersion } from "@/lib/server/forms";
import { jsonError, jsonOk, readJson } from "@/lib/server/http";
import { buildRuntimePayload } from "@/lib/server/runtime";

interface NavigateInput {
  direction?: "back" | "forward";
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

    const body = await readJson<NavigateInput>(request);
    const direction = body.direction;

    if (direction !== "back" && direction !== "forward") {
      return jsonError("direction must be 'back' or 'forward'", 400);
    }

    const published = await getPublishedSchemaByFormAndVersion(session.formId, session.versionNumber);

    if (!published) {
      return jsonError("Published form version not found", 404);
    }

    const reconciled = reconcileAnswers(published.schema, session.answers);
    const cursor = computeRuntimeCursor(
      published.schema,
      reconciled.answers,
      session.currentQuestionId
    );

    let targetQuestionId = findAdjacentQuestionId(
      cursor.questions,
      cursor.currentQuestionId,
      direction
    );

    if (direction === "back" && targetQuestionId === null && cursor.currentQuestionId) {
      targetQuestionId = cursor.currentQuestionId;
    }

    const history = [...session.history];
    if (targetQuestionId && history[history.length - 1] !== targetQuestionId) {
      history.push(targetQuestionId);
    }

    await updateSessionState({
      sessionToken,
      currentQuestionId: targetQuestionId,
      answersJson: JSON.stringify(reconciled.answers),
      historyJson: JSON.stringify(history),
      branchTraceJson: JSON.stringify(reconciled.branchTrace)
    });

    return jsonOk({
      runtime: buildRuntimePayload(published.schema, {
        ...session,
        currentQuestionId: targetQuestionId,
        answers: reconciled.answers,
        history,
        branchTrace: reconciled.branchTrace
      })
    });
  } catch (error) {
    return jsonError("Unable to navigate session", 500, String(error));
  }
}
