import { NextRequest } from "next/server";

import { getFormById, updateDraft } from "@/lib/db/app-store";
import { enforceCsrf } from "@/lib/server/csrf";
import { applyRateLimit } from "@/lib/server/rate-limit";
import { updateDraftInputSchema } from "@/lib/server/validation";
import {
  handleRouteError,
  jsonError,
  jsonOk,
  readJson,
  workspaceIdFromRequest
} from "@/lib/server/http";
import { type FormSchema } from "@/lib/types";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ formId: string }> }
) {
  try {
    enforceCsrf(request);
    const rateLimit = applyRateLimit(request, {
      scope: "admin.forms.draft.update",
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

    const workspaceId = workspaceIdFromRequest(request);
    const { formId } = await context.params;
    const form = await getFormById(formId);

    if (!form || form.workspaceId !== workspaceId) {
      return jsonError("Form not found", 404);
    }

    const body = await readJson<unknown>(request, {
      maxBytes: 1_000_000
    });
    const parsed = updateDraftInputSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("Invalid draft payload", 400, parsed.error.flatten());
    }

    const result = await updateDraft(
      formId,
      parsed.data.schema as FormSchema,
      parsed.data.actor ?? "system"
    );
    if (!result.ok) {
      return jsonError("Draft validation failed", 422, result.errors);
    }

    return jsonOk({ ok: true });
  } catch (error) {
    return handleRouteError("Unable to update draft", error);
  }
}
