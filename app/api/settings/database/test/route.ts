import { type NextRequest } from "next/server";

import { testPlatformDbConnection } from "@/lib/db/platform";
import { mergePlatformDbConfig, type PlatformDbConfig } from "@/lib/db/platform-store";
import { readAdminSession } from "@/lib/server/auth";
import { jsonError, jsonOk, readJson, handleRouteError } from "@/lib/server/http";
import { applyRateLimit } from "@/lib/server/rate-limit";
import { platformDbConfigSchema } from "@/lib/server/validation";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = applyRateLimit(request, { scope: "settings", limit: 10, windowMs: 60_000 });

    if (!rateLimit.allowed) {
      return jsonError("Rate limit exceeded", 429, null, {
        headers: {
          "retry-after": String(rateLimit.retryAfterSeconds)
        }
      });
    }

    const session = readAdminSession(request);
    if (!session) {
      return jsonError("Authentication required", 401);
    }

    const body = await readJson<{ config: PlatformDbConfig }>(request);
    const parsed = platformDbConfigSchema.safeParse(body.config);

    if (!parsed.success) {
      return jsonError("Invalid configuration", 400, parsed.error.flatten());
    }

    const merged = await mergePlatformDbConfig(parsed.data);
    return jsonOk(await testPlatformDbConnection(merged.config));
  } catch (error) {
    return handleRouteError("Failed to test database connection", error);
  }
}
