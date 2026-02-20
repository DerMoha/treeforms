import { type NextRequest } from "next/server";

import { testPlatformDbConnection } from "@/lib/db/app-store";
import { PLATFORM_SUBMISSION_DB_URL, APP_DB_URL } from "@/lib/server/constants";
import { jsonError, jsonOk, readJson, handleRouteError } from "@/lib/server/http";
import { platformDbConfigSchema } from "@/lib/server/validation";
import { readAdminSession } from "@/lib/server/auth";
import { applyRateLimit } from "@/lib/server/rate-limit";

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

    const body = await readJson<{
      config: {
        mode: "env-var" | "mysql" | "sqlite";
        host?: string;
        port?: number;
        database?: string;
        username?: string;
        password?: string;
        sslMode?: "disabled" | "preferred" | "required";
        sslCaCert?: string;
        sslClientCert?: string;
        sslClientKey?: string;
      };
    }>(request);

    const parsed = platformDbConfigSchema.safeParse(body.config);
    if (!parsed.success) {
      return jsonError(
        "Invalid configuration",
        400,
        parsed.error.errors
      );
    }

    const config = parsed.data;

    // Test the connection
    const result = await testPlatformDbConnection(config);

    return jsonOk(result);
  } catch (error) {
    return handleRouteError("Failed to test database connection", error);
  }
}
