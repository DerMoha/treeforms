import { NextRequest } from "next/server";

import { testDbTarget } from "@/lib/db/app-store";
import { enforceCsrf } from "@/lib/server/csrf";
import { assertSafeDbTargetHost, assertSafeDbTargetPort } from "@/lib/server/network-policy";
import { applyRateLimit } from "@/lib/server/rate-limit";
import { dbTargetInputSchema } from "@/lib/server/validation";
import {
  handleRouteError,
  jsonError,
  jsonOk,
  readJson,
  workspaceIdFromRequest
} from "@/lib/server/http";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> }
) {
  try {
    enforceCsrf(request);
    const rateLimit = applyRateLimit(request, {
      scope: "admin.workspace.db-target.test",
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

    const adminWorkspaceId = workspaceIdFromRequest(request);
    const { workspaceId } = await context.params;
    if (workspaceId !== adminWorkspaceId) {
      return jsonError("Workspace not found", 404);
    }

    const raw = await readJson<unknown>(request, {
      maxBytes: 16 * 1024
    });
    const parsed = dbTargetInputSchema.safeParse(raw);

    if (!parsed.success) {
      return jsonError("Invalid DB target payload", 400, parsed.error.flatten());
    }

    const safeHost = await assertSafeDbTargetHost(parsed.data.host);
    const safePort = assertSafeDbTargetPort(parsed.data.port);

    await testDbTarget({
      name: parsed.data.name,
      host: safeHost,
      port: safePort,
      user: parsed.data.user,
      password: parsed.data.password,
      databaseName: parsed.data.databaseName
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleRouteError("Unable to test MariaDB target", error);
  }
}
