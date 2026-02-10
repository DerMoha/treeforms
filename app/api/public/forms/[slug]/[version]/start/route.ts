import { NextRequest } from "next/server";

import { computeRuntimeCursor, reconcileAnswers } from "@/lib/engine";
import { createSession, getSessionByResumeToken } from "@/lib/db/app-store";
import { getPublishedSchemaBySlugAndVersion } from "@/lib/server/forms";
import { jsonError, jsonOk, readJson } from "@/lib/server/http";
import { buildRuntimePayload } from "@/lib/server/runtime";

interface StartSessionInput {
  resumeToken?: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string; version: string }> }
) {
  try {
    const { slug, version } = await context.params;
    const versionNumber = Number(version);

    if (!Number.isFinite(versionNumber)) {
      return jsonError("Invalid version", 400);
    }

    const published = await getPublishedSchemaBySlugAndVersion(slug, versionNumber);

    if (!published) {
      return jsonError("Published form not found", 404);
    }

    const body = await readJson<StartSessionInput>(request).catch(
      () => null as StartSessionInput | null
    );

    if (body?.resumeToken) {
      const resumed = await getSessionByResumeToken(body.resumeToken);

      if (
        resumed &&
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
    return jsonError("Unable to start session", 500, String(error));
  }
}
