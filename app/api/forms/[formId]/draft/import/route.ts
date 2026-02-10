import { NextRequest } from "next/server";

import { updateDraft } from "@/lib/db/app-store";
import { prepareImportedSchema } from "@/lib/form-transfer";
import { getFormBundle } from "@/lib/server/forms";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await context.params;
    const bundle = await getFormBundle(formId);

    if (!bundle) {
      return jsonError("Form not found", 404);
    }

    const payload = await parseJsonObject(request);
    if (!payload.ok) {
      return jsonError(payload.error, 400);
    }

    const prepared = prepareImportedSchema(payload.value, {
      targetFormId: formId,
      fallbackTitle: bundle.form.title
    });

    if (!prepared.ok) {
      return jsonError("Draft import validation failed", 422, prepared.errors);
    }

    const updated = await updateDraft(formId, prepared.schema, "import");
    if (!updated.ok) {
      return jsonError("Draft import validation failed", 422, updated.errors);
    }

    return jsonOk({
      ok: true,
      schema: prepared.schema,
      warnings: prepared.warnings
    });
  } catch (error) {
    return jsonError("Unable to import form JSON", 500, String(error));
  }
}

async function parseJsonObject(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      ok: false as const,
      error: "Invalid JSON body"
    };
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false as const,
      error: "Payload must be a JSON object"
    };
  }

  return {
    ok: true as const,
    value: body
  };
}
