import { getStorage } from "@/lib/db/storage";

export type PlatformDbMode = "env-var" | "mysql" | "sqlite";

export interface PlatformDbConfig {
  mode: PlatformDbMode;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  sslMode?: "disabled" | "preferred" | "required";
  sslCaCert?: string;
  sslClientCert?: string;
  sslClientKey?: string;
  sqlitePath?: string;
}

const PLATFORM_DB_CONFIG_KEY = "platform_db_config";

export async function getPlatformSetting(key: string): Promise<string | null> {
  return getStorage().platformSettings.get(key);
}

export async function setPlatformSetting(key: string, value: string, encrypt = false): Promise<void> {
  return getStorage().platformSettings.set(key, value, encrypt);
}

export async function getPlatformDbConfig(): Promise<PlatformDbConfig | null> {
  const value = await getPlatformSetting(PLATFORM_DB_CONFIG_KEY);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as PlatformDbConfig;
  } catch {
    return null;
  }
}

export async function setPlatformDbConfig(config: PlatformDbConfig): Promise<void> {
  const value = JSON.stringify(config);
  await setPlatformSetting(PLATFORM_DB_CONFIG_KEY, value, true);
}

export async function testPlatformDbConnection(config: PlatformDbConfig): Promise<{ ok: boolean; error?: string }> {
  if (config.mode === "sqlite") {
    return { ok: true };
  }

  if (config.mode === "env-var") {
    const { PLATFORM_SUBMISSION_DB_URL, APP_DB_URL } = await import("@/lib/server/constants");
    const url = PLATFORM_SUBMISSION_DB_URL || APP_DB_URL;
    if (!url) {
      return { ok: false, error: "No SUBMISSION_DATABASE_URL or APP_DATABASE_URL environment variable is set." };
    }

    try {
      const { createEphemeralExternalPool, pingPool } = await import("@/lib/db/platform");
      const pool = createEphemeralExternalPool(url, 4000);
      await pingPool(pool);
      await pool.end();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  if (!config.host || !config.port || !config.database || !config.username) {
    return { ok: false, error: "Missing required connection parameters." };
  }

  try {
    const { getConfiguredSubmissionPool, pingPool, ensureSubmissionTables } = await import("@/lib/db/platform");

    const pool = getConfiguredSubmissionPool({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password || "",
      databaseName: config.database,
      ssl: {
        mode: config.sslMode || "disabled",
        ca: config.sslCaCert,
        cert: config.sslClientCert,
        key: config.sslClientKey
      }
    });

    await pingPool(pool);
    await ensureSubmissionTables(pool);
    await pool.end();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
