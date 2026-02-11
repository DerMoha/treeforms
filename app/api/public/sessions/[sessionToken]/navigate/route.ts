import { NextRequest } from "next/server";

import { computeRuntimeCursor, findAdjacentQuestionId, reconcileAnswers } from "@/lib/engine";
import { getSession, isSessionExpired, updateSessionState } from "@/lib/db/app-store";
import { getPublishedSchemaByFormAndVersion } from "@/lib/server/forms";
import { applyRateLimit } from "@/lib/server/rate-limit";
import { buildRuntimePayload } from "@/lib/server/runtime";
import { navigateInputSchema } from "@/lib/server/validation";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/server/http";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionToken: string }> }
) {
  try {
    const rateLimit = applyRateLimit(request, {
      scope: "public.session.navigate",
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

    if (isSessionExpired(session)) {
      return jsonError("Session expired", 410);
    }

    const rawBody = await readJson<unknown>(request, {
      maxBytes: 8 * 1024
    });
    const body = navigateInputSchema.safeParse(rawBody);

    if (!body.success) {
      return jsonError("Invalid navigation payload", 400, body.error.flatten());
    }

    const direction = body.data.direction;

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
    return handleRouteError("Unable to navigate session", error);
  }
}
