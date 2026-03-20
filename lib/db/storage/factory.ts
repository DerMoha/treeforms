import {
  databaseConfigFingerprint,
  type StoredDatabaseConfigRecord
} from "@/lib/db/database-config";
import { getActiveDatabaseConfigRecord } from "@/lib/db/bootstrap-store";
import { createDatabaseClient, type DatabaseClient } from "@/lib/db/storage/client";
import { createRelationalStorage } from "@/lib/db/storage/relational-store";
import { ensureStorageSchema } from "@/lib/db/storage/schema";
import { type Storage } from "@/lib/db/storage/interface";

let activeStorage: Storage | null = null;
let activeClient: DatabaseClient | null = null;
let activeFingerprint = "";
let activeRecord: StoredDatabaseConfigRecord | null = null;

export async function getStorage(): Promise<Storage> {
  const record = await getActiveDatabaseConfigRecord();
  const fingerprint = databaseConfigFingerprint(record.config);

  if (activeStorage && activeClient && fingerprint === activeFingerprint) {
    return activeStorage;
  }

  if (activeClient) {
    await activeClient.close();
  }

  const client = await createDatabaseClient(record.config);
  await ensureStorageSchema(client);

  activeClient = client;
  activeStorage = createRelationalStorage(client);
  activeFingerprint = fingerprint;
  activeRecord = record;

  return activeStorage;
}

export async function invalidateStorage(): Promise<void> {
  if (activeClient) {
    await activeClient.close();
  }

  activeClient = null;
  activeStorage = null;
  activeFingerprint = "";
  activeRecord = null;
}

export function getActiveStorageRecord() {
  return activeRecord;
}
