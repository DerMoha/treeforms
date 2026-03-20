import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { createPool, type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";

import { resolveSqlitePath, type DatabaseConfig, type MysqlDatabaseConfig } from "@/lib/db/database-config";

export type QueryParam = string | number | null;

export interface DatabaseClient {
  readonly dialect: "sqlite" | "mysql";
  execute(sql: string, params?: QueryParam[]): Promise<void>;
  query<T>(sql: string, params?: QueryParam[]): Promise<T[]>;
  transaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function createDatabaseClient(config: DatabaseConfig): Promise<DatabaseClient> {
  if (config.mode === "sqlite") {
    return createSqliteClient(config.sqlitePath);
  }

  return createMysqlClient(config);
}

class MysqlClient implements DatabaseClient {
  readonly dialect = "mysql" as const;

  constructor(
    private readonly executor: Pool | PoolConnection,
    private readonly closeHandler: (() => Promise<void>) | null,
    private readonly transactional: boolean
  ) {}

  async execute(sql: string, params: QueryParam[] = []): Promise<void> {
    await this.executor.execute(sql, params);
  }

  async query<T>(sql: string, params: QueryParam[] = []): Promise<T[]> {
    const [rows] = await this.executor.execute<RowDataPacket[]>(sql, params);
    return rows as unknown as T[];
  }

  async transaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
    if (this.transactional && "release" in this.executor) {
      return work(this);
    }

    if (!("getConnection" in this.executor)) {
      return work(this);
    }

    const connection = await this.executor.getConnection();
    const transactionalClient = new MysqlClient(connection, async () => connection.release(), true);

    try {
      await connection.beginTransaction();
      const result = await work(transactionalClient);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await transactionalClient.close();
    }
  }

  async close(): Promise<void> {
    if (this.closeHandler) {
      await this.closeHandler();
    }
  }
}

class SqliteClient implements DatabaseClient {
  readonly dialect = "sqlite" as const;

  constructor(
    private readonly database: InstanceType<typeof Database>,
    private readonly closeHandler: (() => void) | null,
    private inTransaction = false
  ) {}

  async execute(sql: string, params: QueryParam[] = []): Promise<void> {
    this.database.prepare(sql).run(...params);
  }

  async query<T>(sql: string, params: QueryParam[] = []): Promise<T[]> {
    return this.database.prepare(sql).all(...params) as T[];
  }

  async transaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      return work(this);
    }

    this.database.exec("BEGIN IMMEDIATE");
    const transactionalClient = new SqliteClient(this.database, null, true);

    try {
      const result = await work(transactionalClient);
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async close(): Promise<void> {
    this.closeHandler?.();
  }
}

async function createMysqlClient(config: MysqlDatabaseConfig): Promise<DatabaseClient> {
  const pool = createPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl:
      config.sslMode === "disabled"
        ? undefined
        : {
            rejectUnauthorized: config.sslMode === "required",
            ca: config.sslCaCert,
            cert: config.sslClientCert,
            key: config.sslClientKey
          }
  });

  return new MysqlClient(pool, async () => pool.end(), false);
}

async function createSqliteClient(sqlitePath: string): Promise<DatabaseClient> {
  const filePath = resolveSqlitePath(sqlitePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const database = new Database(filePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  return new SqliteClient(database, () => database.close());
}
