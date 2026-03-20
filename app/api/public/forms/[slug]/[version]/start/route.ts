import { NextRequest } from "next/server";

import { computeRuntimeCursor, reconcileAnswers } from "@/lib/engine";
import { createSession, getSessionByResumeToken, isSessionExpired } from "@/lib/db/app-store";
import { getPublishedSchemaBySlugAndVersion } from "@/lib/server/forms";
import { applyRateLimit } from "@/lib/server/rate-limit";
import { startSessionInputSchema } from "@/lib/server/validation";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/server/http";
import { buildRuntimePayload } from "@/lib/server/runtime";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string; version: string }> }
) {
  try {
    const rateLimit = applyRateLimit(request, {
      scope: "public.session.start",
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

    const { slug, version } = await context.params;
    const versionNumber = Number(version);

    if (!Number.isInteger(versionNumber) || versionNumber < 1) {
      return jsonError("Invalid version", 400);
    }

    const published = await getPublishedSchemaBySlugAndVersion(slug, versionNumber);

    if (!published) {
      return jsonError("Published form not found", 404);
    }

    const rawBody = await readJson<unknown>(request, {
      maxBytes: 8 * 1024,
      allowEmpty: true
    });
    const body = startSessionInputSchema.safeParse(rawBody);

    if (!body.success) {
      return jsonError("Invalid session start payload", 400, body.error.flatten());
    }

    if (body.data.resumeToken) {
      const resumed = await getSessionByResumeToken(body.data.resumeToken);

      if (
        resumed &&
        !(await isSessionExpired(resumed)) &&
        resumed.formId === published.formId &&
        resumed.versionNumber === published.versionNumber
      ) {
        return jsonOk({
          resumed: true,
          schema: {
            formId: published.formId,
            title: published.title,
            versionNumber: published.versionNumber
          },
          runtime: buildRuntimePayload(published.schema, resumed)
        });
      }
    }

    const cursor = computeRuntimeCursor(published.schema, {}, null);
    const sessionTokens = await createSession({
      workspaceId: published.workspaceId,
      formId: published.formId,
      versionNumber: published.versionNumber,
      currentQuestionId: cursor.currentQuestionId
    });

    const initial = {
      sessionToken: sessionTokens.sessionToken,
      resumeToken: sessionTokens.resumeToken,
      workspaceId: published.workspaceId,
      formId: published.formId,
      versionNumber: published.versionNumber,
      status: "in_progress" as const,
      currentQuestionId: cursor.currentQuestionId,
      answers: {},
      history: cursor.currentQuestionId ? [cursor.currentQuestionId] : [],
      branchTrace: [],
      expiresAt: sessionTokens.expiresAt,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const reconciled = reconcileAnswers(published.schema, initial.answers);

    return jsonOk(
      {
        resumed: false,
        schema: {
          formId: published.formId,
          title: published.title,
          versionNumber: published.versionNumber
        },
        runtime: buildRuntimePayload(published.schema, {
          ...initial,
          answers: reconciled.answers,
          branchTrace: reconciled.branchTrace
        })
      },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError("Unable to start session", error);
  }
}
