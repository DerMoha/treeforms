import path from "node:path";

import { IS_TEST } from "@/lib/server/constants";

export type DatabaseMode = "sqlite" | "mysql";
export type DatabaseSslMode = "disabled" | "preferred" | "required";

export interface SqliteDatabaseConfig {
  mode: "sqlite";
  sqlitePath: string;
}

export interface MysqlDatabaseConfig {
  mode: "mysql";
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  sslMode: DatabaseSslMode;
  sslCaCert?: string;
  sslClientCert?: string;
  sslClientKey?: string;
}

export type DatabaseConfig = SqliteDatabaseConfig | MysqlDatabaseConfig;

export interface StoredDatabaseConfigRecord {
  config: DatabaseConfig;
  updatedAt: string;
  lastValidatedAt: string | null;
  lastValidationError: string | null;
}

export interface DatabaseSecretState {
  hasPassword: boolean;
  hasSslCaCert: boolean;
  hasSslClientCert: boolean;
  hasSslClientKey: boolean;
}

const DEFAULT_SQLITE_FILENAME = IS_TEST
  ? `.data/treeforms-test-${process.pid}.sqlite`
  : ".data/treeforms.sqlite";

const DEFAULT_SYSTEM_SQLITE_FILENAME = IS_TEST
  ? `.data/treeforms-system-test-${process.pid}.sqlite`
  : ".data/treeforms-system.sqlite";

export const DEFAULT_SQLITE_DATABASE_PATH =
  process.env.TREEFORMS_DEFAULT_SQLITE_PATH?.trim() ||
  process.env.LOCAL_SQLITE_PATH?.trim() ||
  process.env.SQLITE_DATABASE_PATH?.trim() ||
  DEFAULT_SQLITE_FILENAME;

export const SYSTEM_SQLITE_DATABASE_PATH =
  process.env.TREEFORMS_SYSTEM_SQLITE_PATH?.trim() || DEFAULT_SYSTEM_SQLITE_FILENAME;

export function getDefaultDatabaseConfig(): DatabaseConfig {
  return {
    mode: "sqlite",
    sqlitePath: DEFAULT_SQLITE_DATABASE_PATH
  };
}

export function databaseConfigFingerprint(config: DatabaseConfig): string {
  return JSON.stringify(config);
}

export function resolveSqlitePath(sqlitePath: string): string {
  const trimmed = sqlitePath.trim();

  if (!trimmed) {
    throw new Error("SQLite database path is required.");
  }

  const resolved = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(process.cwd(), trimmed);

  const extension = path.extname(resolved).toLowerCase();
  if (![".sqlite", ".sqlite3", ".db"].includes(extension)) {
    throw new Error("SQLite database path must end in .sqlite, .sqlite3, or .db.");
  }

  if (!path.isAbsolute(trimmed)) {
    const workspaceRoot = path.resolve(process.cwd());
    if (resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}${path.sep}`)) {
      throw new Error("Relative SQLite database paths must stay inside the workspace.");
    }
  }

  return resolved;
}

export function toSecretState(config: DatabaseConfig): DatabaseSecretState {
  if (config.mode === "sqlite") {
    return {
      hasPassword: false,
      hasSslCaCert: false,
      hasSslClientCert: false,
      hasSslClientKey: false
    };
  }

  return {
    hasPassword: config.password !== undefined,
    hasSslCaCert: config.sslCaCert !== undefined,
    hasSslClientCert: config.sslClientCert !== undefined,
    hasSslClientKey: config.sslClientKey !== undefined
  };
}

export function redactDatabaseConfig(config: DatabaseConfig): DatabaseConfig {
  if (config.mode === "sqlite") {
    return config;
  }

  return {
    mode: "mysql",
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.username,
    sslMode: config.sslMode
  };
}

export function normalizeDatabaseConfig(config: DatabaseConfig): DatabaseConfig {
  if (config.mode === "sqlite") {
    return {
      mode: "sqlite",
      sqlitePath: config.sqlitePath.trim() || DEFAULT_SQLITE_DATABASE_PATH
    };
  }

  return {
    mode: "mysql",
    host: config.host.trim(),
    port: config.port,
    database: config.database.trim(),
    username: config.username.trim(),
    password: config.password,
    sslMode: config.sslMode,
    sslCaCert: config.sslCaCert,
    sslClientCert: config.sslClientCert,
    sslClientKey: config.sslClientKey
  };
}
