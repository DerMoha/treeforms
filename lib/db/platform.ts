import { saveStoredDatabaseConfigRecord } from "@/lib/db/bootstrap-store";
import { type DatabaseConfig } from "@/lib/db/database-config";
import { mergePlatformDbConfig } from "@/lib/db/platform-store";
import { createDatabaseClient } from "@/lib/db/storage/client";
import { invalidateStorage } from "@/lib/db/storage/factory";
import { ensureStorageSchema } from "@/lib/db/storage/schema";

export async function testPlatformDbConnection(
  config: DatabaseConfig
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  let client = null;

  try {
    client = await createDatabaseClient(config);
    await ensureStorageSchema(client);
    await client.query<{ value: number }>("SELECT 1 AS value");

    return {
      ok: true,
      message:
        config.mode === "sqlite"
          ? "SQLite database is ready."
          : "MySQL connection succeeded and schema is ready."
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Database connection failed"
    };
  } finally {
    await client?.close();
  }
}

export async function applyPlatformDbConfig(
  input: DatabaseConfig
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const nextRecord = await mergePlatformDbConfig(input);
  const tested = await testPlatformDbConnection(nextRecord.config);
  const validatedAt = new Date().toISOString();

  if (!tested.ok) {
    return tested;
  }

  await saveStoredDatabaseConfigRecord({
    ...nextRecord,
    lastValidatedAt: validatedAt,
    lastValidationError: null
  });
  await invalidateStorage();

  return {
    ok: true,
    message: "Database configuration saved successfully."
  };
}

export async function invalidatePlatformConnections(): Promise<void> {
  await invalidateStorage();
}
