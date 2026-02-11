import { NextRequest } from "next/server";

import { updateDraft } from "@/lib/db/app-store";
import { prepareImportedSchema } from "@/lib/form-transfer";
import { getFormBundle } from "@/lib/server/forms";
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ formId: string }> }
) {
  try {
    enforceCsrf(request);
    const rateLimit = applyRateLimit(request, {
      scope: "admin.forms.draft.import",
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
    const { formId } = await context.params;
    const bundle = await getFormBundle(formId);

    if (!bundle || bundle.form.workspaceId !== workspaceId) {
      return jsonError("Form not found", 404);
    }

    const payload = await parseJsonObject(request);
    if (!payload.ok) {
      return jsonError(payload.error, payload.status ?? 400);
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
