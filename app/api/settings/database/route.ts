import { type NextRequest } from "next/server";

import {
  getPlatformDbConfig,
  setPlatformDbConfig,
  type PlatformDbConfig
} from "@/lib/db/app-store";
import {
  invalidatePlatformSubmissionPool
} from "@/lib/db/platform";
import { PLATFORM_SUBMISSION_DB_URL, APP_DB_URL } from "@/lib/server/constants";
import { jsonError, jsonOk, readJson, handleRouteError } from "@/lib/server/http";
import { platformDbConfigSchema } from "@/lib/server/validation";
import { readAdminSession } from "@/lib/server/auth";
import { applyRateLimit } from "@/lib/server/rate-limit";

export async function GET(request: NextRequest) {
  try {
    await applyRateLimit(request, { scope: "settings", limit: 60, windowMs: 60_000 });

    const session = readAdminSession(request);
    if (!session) {
      return jsonError("Authentication required", 401);
    }

    const config = await getPlatformDbConfig();
    const hasEnvVar = Boolean(PLATFORM_SUBMISSION_DB_URL || APP_DB_URL);

    return jsonOk({
      config: config
        ? maskSensitiveValues(config)
        : null,
      currentSource: config
        ? config.mode === "env-var"
          ? "environment-variable"
          : "stored-configuration"
        : hasEnvVar
          ? "environment-variable"
          : "none"
    });
  } catch (error) {
    return handleRouteError("Failed to get database configuration", error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await applyRateLimit(request, { scope: "settings", limit: 10, windowMs: 60_000 });

    const session = readAdminSession(request);
    if (!session) {
      return jsonError("Authentication required", 401);
    }

    const body = await readJson<{
      config: PlatformDbConfig;
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

    if (config.mode === "mysql") {
      if (!config.host || !config.port || !config.database || !config.username) {
        return jsonError(
          "MySQL configuration requires host, port, database, and username",
          400
        );
      }
    }

    if (config.mode === "sqlite" && config.sqlitePath) {
      if (config.sqlitePath.includes("..") || !config.sqlitePath.endsWith(".sqlite") && !config.sqlitePath.endsWith(".db")) {
        return jsonError(
          "Invalid SQLite database path",
          400
        );
      }
    }

    await setPlatformDbConfig(config);
    invalidatePlatformSubmissionPool();

    return jsonOk({
      ok: true,
      message: "Database configuration updated successfully. The submission pool will be recreated on next use."
    });
  } catch (error) {
    return handleRouteError("Failed to update database configuration", error);
  }
}

function maskSensitiveValues(config: PlatformDbConfig): PlatformDbConfig {
  return {
    ...config,
    password: config.password ? "***" : undefined,
    sslCaCert: config.sslCaCert ? "***" : undefined,
    sslClientCert: config.sslClientCert ? "***" : undefined,
    sslClientKey: config.sslClientKey ? "***" : undefined
  };
}
