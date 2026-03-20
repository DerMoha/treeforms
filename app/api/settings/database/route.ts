import { type NextRequest } from "next/server";

import { applyPlatformDbConfig } from "@/lib/db/platform";
import { getPlatformDbSettings, type PlatformDbConfig } from "@/lib/db/platform-store";
import { readAdminSession } from "@/lib/server/auth";
import { jsonError, jsonOk, readJson, handleRouteError } from "@/lib/server/http";
import { applyRateLimit } from "@/lib/server/rate-limit";
import { platformDbConfigSchema } from "@/lib/server/validation";

export async function GET(request: NextRequest) {
  try {
    const rateLimit = applyRateLimit(request, { scope: "settings", limit: 60, windowMs: 60_000 });

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

    return jsonOk(await getPlatformDbSettings());
  } catch (error) {
    return handleRouteError("Failed to get database configuration", error);
  }
}

export async function PUT(request: NextRequest) {
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

    const result = await applyPlatformDbConfig(parsed.data);
    if (!result.ok) {
      return jsonError(result.error, 400);
    }

    return jsonOk(result);
  } catch (error) {
    return handleRouteError("Failed to update database configuration", error);
  }
}
