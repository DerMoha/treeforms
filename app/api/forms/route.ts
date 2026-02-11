import { NextRequest } from "next/server";

import { createForm, listForms } from "@/lib/db/app-store";
import { enforceCsrf } from "@/lib/server/csrf";
import { applyRateLimit } from "@/lib/server/rate-limit";
import { createFormInputSchema } from "@/lib/server/validation";
import {
  handleRouteError,
  jsonError,
  jsonOk,
  readJson,
  workspaceIdFromRequest
} from "@/lib/server/http";

export async function GET(request: NextRequest) {
  try {
    const workspaceId = workspaceIdFromRequest(request);
    const forms = await listForms(workspaceId);
    return jsonOk({ forms });
  } catch (error) {
    return handleRouteError("Unable to list forms", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    enforceCsrf(request);
    const rateLimit = applyRateLimit(request, {
      scope: "admin.forms.create",
      limit: 30,
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
    const body = await readJson<unknown>(request, {
      maxBytes: 16 * 1024
    });
    const parsed = createFormInputSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid form payload", 400, parsed.error.flatten());
    }

    const created = await createForm(workspaceId, parsed.data.title);
    return jsonOk({ form: created }, { status: 201 });
  } catch (error) {
    return handleRouteError("Unable to create form", error);
  }
}
