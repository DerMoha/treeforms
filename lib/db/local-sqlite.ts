import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";

const LOCAL_SQLITE_PATH =
  process.env.LOCAL_SQLITE_PATH?.trim() ||
  process.env.SQLITE_DATABASE_PATH?.trim() ||
  ".data/treeforms-local.sqlite";
const LOCAL_SQLITE_DISABLED = process.env.LOCAL_SQLITE_DISABLED === "1";

interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): Record<string, unknown> | undefined;
}

interface SqliteDatabase {
  pragma(command: string): unknown;
  prepare(sql: string): SqliteStatement;
}

type SqliteCtor = new (filename: string, options?: Record<string, unknown>) => SqliteDatabase;

declare global {
  // eslint-disable-next-line no-var
  var __TREEFORMS_LOCAL_SQLITE_DB: SqliteDatabase | undefined;
  // eslint-disable-next-line no-var
  var __TREEFORMS_LOCAL_SQLITE_READY: boolean | undefined;
}

export function readLocalJson<T>(key: string): T | null {
  const db = getLocalSqliteDb();
  if (!db) {
    return null;
  }

  const row = db
    .prepare(`SELECT value_json FROM local_json_store WHERE key_name = ?`)
    .get(key) as { value_json?: string } | undefined;

  if (!row?.value_json) {
    return null;
  }

  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return null;
  }
}

export function writeLocalJson(key: string, value: unknown) {
  const db = getLocalSqliteDb();
  if (!db) {
    return;
  }

  db.prepare(
    `
      INSERT INTO local_json_store (key_name, value_json, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key_name) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = CURRENT_TIMESTAMP
    `
  ).run(key, JSON.stringify(value));
}

export function localSqlitePath() {
  const db = getLocalSqliteDb();
  if (!db) {
    return null;
  }

  return resolveSqlitePath(LOCAL_SQLITE_PATH);
}

function getLocalSqliteDb(): SqliteDatabase | null {
  if (LOCAL_SQLITE_DISABLED) {
    return null;
  }

  if (globalThis.__TREEFORMS_LOCAL_SQLITE_READY) {
    return globalThis.__TREEFORMS_LOCAL_SQLITE_DB ?? null;
  }

  const Ctor = loadSqliteCtor();
  if (!Ctor) {
    globalThis.__TREEFORMS_LOCAL_SQLITE_READY = true;
    return null;
  }

  const filePath = resolveSqlitePath(LOCAL_SQLITE_PATH);
  mkdirSync(dirname(filePath), { recursive: true });

  const db = new Ctor(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 2000");
  db.prepare(
    `
      CREATE TABLE IF NOT EXISTS local_json_store (
        key_name TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `
  ).run();

  globalThis.__TREEFORMS_LOCAL_SQLITE_DB = db;
  globalThis.__TREEFORMS_LOCAL_SQLITE_READY = true;
  return db;
}

function loadSqliteCtor(): SqliteCtor | null {
  try {
    const localRequire = createRequire(import.meta.url);
    const loaded = localRequire("better-sqlite3") as { default?: SqliteCtor } | SqliteCtor;

    if (typeof loaded === "function") {
      return loaded;
    }

    if (loaded && typeof loaded.default === "function") {
      return loaded.default;
    }

    return null;
  } catch {
    return null;
  }
}

function resolveSqlitePath(inputPath: string) {
  const workspaceRoot = resolve(process.cwd());
  const resolvedPath = resolve(workspaceRoot, inputPath);
  const relativeToRoot = relative(workspaceRoot, resolvedPath);
  const normalizedRelative = relativeToRoot.replaceAll("\\", "/");

  const escapesWorkspace =
    normalizedRelative.startsWith("..") ||
    normalizedRelative.includes("/../") ||
    normalizedRelative === "..";

  if (escapesWorkspace) {
    throw new Error("LOCAL_SQLITE_PATH must stay inside the workspace root.");
  }

  return resolvedPath;
}
