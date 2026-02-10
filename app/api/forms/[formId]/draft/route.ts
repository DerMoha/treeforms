import { NextRequest } from "next/server";

import { updateDraft } from "@/lib/db/app-store";
import { jsonError, jsonOk, readJson } from "@/lib/server/http";
import { type FormSchema } from "@/lib/types";

interface UpdateDraftInput {
  schema?: FormSchema;
  actor?: string;
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await context.params;
    const body = await readJson<UpdateDraftInput>(request);

    if (!body.schema) {
      return jsonError("schema is required", 400);
    }

    const result = await updateDraft(formId, body.schema, body.actor ?? "system");
    if (!result.ok) {
      return jsonError("Draft validation failed", 422, result.errors);
    }

    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError("Unable to update draft", 500, String(error));
  }
}
