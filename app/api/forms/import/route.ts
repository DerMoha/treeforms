import { NextRequest } from "next/server";

import { createForm, updateDraft } from "@/lib/db/app-store";
import { prepareImportedSchema } from "@/lib/form-transfer";
import { jsonError, jsonOk, workspaceIdFromRequest } from "@/lib/server/http";

const PREVIEW_FORM_ID = "form_import_preview";

export async function POST(request: NextRequest) {
  try {
    const workspaceId = workspaceIdFromRequest(request);
    const payload = await parseJsonObject(request);

    if (!payload.ok) {
      return jsonError(payload.error, 400);
    }

    const preview = prepareImportedSchema(payload.value, {
      targetFormId: PREVIEW_FORM_ID,
      fallbackTitle: "Imported Form"
    });

    if (!preview.ok) {
      return jsonError("Import validation failed", 422, preview.errors);
    }

    const created = await createForm(workspaceId, preview.schema.title);
    const prepared = prepareImportedSchema(payload.value, {
      targetFormId: created.formId,
      fallbackTitle: created.title
    });

    if (!prepared.ok) {
      return jsonError("Import validation failed", 422, prepared.errors);
    }

    const updated = await updateDraft(created.formId, prepared.schema, "import");
    if (!updated.ok) {
      return jsonError("Import validation failed", 422, updated.errors);
    }

    return jsonOk(
      {
        ok: true,
        form: created,
        schema: prepared.schema,
        warnings: prepared.warnings
      },
      { status: 201 }
    );
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
