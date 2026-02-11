import { NextRequest } from "next/server";

import { createForm, updateDraft } from "@/lib/db/app-store";
import { prepareImportedSchema } from "@/lib/form-transfer";
import { enforceCsrf } from "@/lib/server/csrf";
import { applyRateLimit } from "@/lib/server/rate-limit";
import {
  HttpError,
  handleRouteError,
  jsonError,
  jsonOk,
  readJson,
  workspaceIdFromRequest
} from "@/lib/server/http";

const PREVIEW_FORM_ID = "form_import_preview";

export async function POST(request: NextRequest) {
  try {
    enforceCsrf(request);
    const rateLimit = applyRateLimit(request, {
      scope: "admin.forms.import",
      limit: 12,
      windowMs: 60_000
    });

    if (!rateLimit.allowed) {
      return jsonError("Rate limit exceeded", 429, null, {
        headers: {
          "retry-after": String(rateLimit.retryAfterSeconds)
        }
      });
    }

    const workspaceId = workspaceIdFromRequest(request);
    const payload = await parseJsonObject(request);

    if (!payload.ok) {
      return jsonError(payload.error, payload.status ?? 400);
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
    return handleRouteError("Unable to import form JSON", error);
  }
}

async function parseJsonObject(request: NextRequest) {
  try {
    const body = await readJson<unknown>(request, {
      maxBytes: 1_000_000
    });

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
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        ok: false as const,
        error: error.message,
        status: error.status
      };
    }

    return {
      ok: false as const,
      error: "Invalid JSON body"
    };
  }
}
