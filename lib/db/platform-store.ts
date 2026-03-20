import {
  getActiveDatabaseConfigRecord,
  getStoredDatabaseConfigRecord,
  saveStoredDatabaseConfigRecord
} from "@/lib/db/bootstrap-store";
import {
  normalizeDatabaseConfig,
  redactDatabaseConfig,
  toSecretState,
  type DatabaseConfig,
  type StoredDatabaseConfigRecord
} from "@/lib/db/database-config";

export type PlatformDbConfig = DatabaseConfig;

export async function getPlatformDbConfig(): Promise<PlatformDbConfig> {
  return (await getActiveDatabaseConfigRecord()).config;
}

export async function getPlatformDbSettings() {
  const [stored, active] = await Promise.all([
    getStoredDatabaseConfigRecord(),
    getActiveDatabaseConfigRecord()
  ]);

  return {
    config: redactDatabaseConfig(active.config),
    secrets: toSecretState(active.config),
    isDefault: stored === null,
    lastValidatedAt: active.lastValidatedAt,
    lastValidationError: active.lastValidationError,
    updatedAt: active.updatedAt
  };
}

export async function mergePlatformDbConfig(input: PlatformDbConfig): Promise<StoredDatabaseConfigRecord> {
  const normalizedInput = normalizeDatabaseConfig(input);
  const current = await getStoredDatabaseConfigRecord();
  const now = new Date().toISOString();

  if (normalizedInput.mode === "sqlite") {
    return {
      config: normalizedInput,
      updatedAt: now,
      lastValidatedAt: null,
      lastValidationError: null
    };
  }

  const existingMysql = current?.config.mode === "mysql" ? current.config : null;

  return {
    config: {
      mode: "mysql",
      host: normalizedInput.host,
      port: normalizedInput.port,
      database: normalizedInput.database,
      username: normalizedInput.username,
      password:
        normalizedInput.password !== undefined
          ? normalizedInput.password
          : existingMysql?.password,
      sslMode: normalizedInput.sslMode,
      sslCaCert:
        normalizedInput.sslCaCert !== undefined
          ? normalizedInput.sslCaCert
          : existingMysql?.sslCaCert,
      sslClientCert:
        normalizedInput.sslClientCert !== undefined
          ? normalizedInput.sslClientCert
          : existingMysql?.sslClientCert,
      sslClientKey:
        normalizedInput.sslClientKey !== undefined
          ? normalizedInput.sslClientKey
          : existingMysql?.sslClientKey
    },
    updatedAt: now,
    lastValidatedAt: null,
    lastValidationError: null
  };
}

export async function savePlatformDbConfigRecord(record: StoredDatabaseConfigRecord): Promise<void> {
  await saveStoredDatabaseConfigRecord(record);
}
