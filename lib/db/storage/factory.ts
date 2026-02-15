import { type Storage } from "./interface";
import { createMemoryStorage } from "./memory-store";
import { createDatabaseStorage } from "./database-store";
import { isAppDbConfigured } from "@/lib/db/platform";

let storageInstance: Storage | null = null;

export function getStorage(): Storage {
  if (storageInstance) {
    return storageInstance;
  }

  storageInstance = isAppDbConfigured() ? createDatabaseStorage() : createMemoryStorage();
  return storageInstance;
}

export function resetStorage(): void {
  storageInstance = null;
}