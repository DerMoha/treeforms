import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { decryptSecret, encryptSecret } from "@/lib/security/crypto";

import {
  getDefaultDatabaseConfig,
  normalizeDatabaseConfig,
  resolveSqlitePath,
  SYSTEM_SQLITE_DATABASE_PATH,
  type DatabaseConfig,
  type StoredDatabaseConfigRecord
} from "@/lib/db/database-config";

const DATABASE_CONFIG_KEY = "database.config.v2";

interface PersistedMysqlConfig {
  mode: "mysql";
  host: string;
  port: number;
  database: string;
  username: string;
  passwordEncrypted?: string;
  sslMode: "disabled" | "preferred" | "required";
  sslCaCertEncrypted?: string;
  sslClientCertEncrypted?: string;
  sslClientKeyEncrypted?: string;
}

interface PersistedSqliteConfig {
  mode: "sqlite";
  sqlitePath: string;
}

type PersistedDatabaseConfig = PersistedMysqlConfig | PersistedSqliteConfig;

interface PersistedDatabaseConfigRecord {
  config: PersistedDatabaseConfig;
  updatedAt: string;
  lastValidatedAt: string | null;
  lastValidationError: string | null;
}

interface SettingRow {
  value_json: string;
}

export async function getStoredDatabaseConfigRecord(): Promise<StoredDatabaseConfigRecord | null> {
  const database = getBootstrapDatabase();
  const row = database
    .prepare("SELECT value_json FROM system_settings WHERE key_name = ? LIMIT 1")
    .get(DATABASE_CONFIG_KEY) as SettingRow | undefined;

  if (!row) {
    return null;
  }

  return deserializeRecord(row.value_json);
}

export async function getActiveDatabaseConfigRecord(): Promise<StoredDatabaseConfigRecord> {
  const stored = await getStoredDatabaseConfigRecord();

  if (stored) {
    return stored;
  }

  return {
    config: getDefaultDatabaseConfig(),
    updatedAt: new Date(0).toISOString(),
    lastValidatedAt: null,
    lastValidationError: null
  };
}

export async function saveStoredDatabaseConfigRecord(record: StoredDatabaseConfigRecord): Promise<void> {
  const database = getBootstrapDatabase();
  const now = new Date().toISOString();

  database
    .prepare(
      `
        INSERT INTO system_settings (key_name, value_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key_name) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
      `
    )
    .run(DATABASE_CONFIG_KEY, serializeRecord(record), now);
}

export async function updateStoredDatabaseValidationState(
  lastValidatedAt: string,
  lastValidationError: string | null
): Promise<void> {
  const current = await getActiveDatabaseConfigRecord();
  await saveStoredDatabaseConfigRecord({
    ...current,
    lastValidatedAt,
    lastValidationError,
    updatedAt: current.updatedAt
  });
}

export async function resetBootstrapStoreForTests(): Promise<void> {
  const filePath = resolveBootstrapFilePath();
  closeBootstrapDatabase();

  [filePath, `${filePath}-wal`, `${filePath}-shm`].forEach((candidate) => {
    try {
      fs.rmSync(candidate, { force: true });
    } catch {
      // Ignore cleanup failures during tests.
    }
  });
}

let bootstrapDatabase: InstanceType<typeof Database> | null = null;

function getBootstrapDatabase() {
  if (bootstrapDatabase) {
    return bootstrapDatabase;
  }

  const filePath = resolveBootstrapFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const database = new Database(filePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(
    `
      CREATE TABLE IF NOT EXISTS system_settings (
        key_name TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `
  );

  bootstrapDatabase = database;
  return database;
}

function closeBootstrapDatabase() {
  if (!bootstrapDatabase) {
    return;
  }

  bootstrapDatabase.close();
  bootstrapDatabase = null;
}

function resolveBootstrapFilePath() {
  return resolveSqlitePath(SYSTEM_SQLITE_DATABASE_PATH);
}

function serializeRecord(record: StoredDatabaseConfigRecord) {
  const next: PersistedDatabaseConfigRecord = {
    config: persistConfig(record.config),
    updatedAt: record.updatedAt,
    lastValidatedAt: record.lastValidatedAt,
    lastValidationError: record.lastValidationError
  };

  return JSON.stringify(next);
}

function deserializeRecord(raw: string): StoredDatabaseConfigRecord {
  const parsed = JSON.parse(raw) as PersistedDatabaseConfigRecord;

  return {
    config: hydrateConfig(parsed.config),
    updatedAt: parsed.updatedAt,
    lastValidatedAt: parsed.lastValidatedAt,
    lastValidationError: parsed.lastValidationError
  };
}

function persistConfig(config: DatabaseConfig): PersistedDatabaseConfig {
  const normalized = normalizeDatabaseConfig(config);

  if (normalized.mode === "sqlite") {
    return normalized;
  }

  return {
    mode: "mysql",
    host: normalized.host,
    port: normalized.port,
    database: normalized.database,
    username: normalized.username,
    passwordEncrypted:
      normalized.password === undefined ? undefined : encryptSecret(normalized.password),
    sslMode: normalized.sslMode,
    sslCaCertEncrypted:
      normalized.sslCaCert === undefined ? undefined : encryptSecret(normalized.sslCaCert),
    sslClientCertEncrypted:
      normalized.sslClientCert === undefined ? undefined : encryptSecret(normalized.sslClientCert),
    sslClientKeyEncrypted:
      normalized.sslClientKey === undefined ? undefined : encryptSecret(normalized.sslClientKey)
  };
}

function hydrateConfig(config: PersistedDatabaseConfig): DatabaseConfig {
  if (config.mode === "sqlite") {
    return {
      mode: "sqlite",
      sqlitePath: config.sqlitePath
    };
  }

  return {
    mode: "mysql",
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.username,
    password:
      config.passwordEncrypted === undefined ? undefined : decryptSecret(config.passwordEncrypted),
    sslMode: config.sslMode,
    sslCaCert:
      config.sslCaCertEncrypted === undefined
        ? undefined
        : decryptSecret(config.sslCaCertEncrypted),
    sslClientCert:
      config.sslClientCertEncrypted === undefined
        ? undefined
        : decryptSecret(config.sslClientCertEncrypted),
    sslClientKey:
      config.sslClientKeyEncrypted === undefined
        ? undefined
        : decryptSecret(config.sslClientKeyEncrypted)
  };
}
