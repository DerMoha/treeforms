import { NextRequest } from "next/server";

import { getFormById, publishDraft } from "@/lib/db/app-store";
import { enforceCsrf } from "@/lib/server/csrf";
import { applyRateLimit } from "@/lib/server/rate-limit";
import { publishInputSchema } from "@/lib/server/validation";
import {
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
      scope: "admin.forms.publish",
      limit: 20,
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

    const rawBody = await readJson<unknown>(request, {
      maxBytes: 8 * 1024,
      allowEmpty: true
    });
    const body = publishInputSchema.safeParse(rawBody);

    if (!body.success) {
      return jsonError("Invalid publish payload", 400, body.error.flatten());
    }

    const result = await publishDraft(formId, body.data.actor ?? "system");

    if (!result.ok) {
      return jsonError(result.error, result.status, (result as { errors?: string[] }).errors ?? null);
    }

    return jsonOk({
      ok: true,
      versionNumber: result.versionNumber,
      versionId: result.versionId
    });
  } catch (error) {
    return handleRouteError("Unable to publish form", error);
  }
}
