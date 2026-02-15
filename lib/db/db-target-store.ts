import { type DbTargetConfig, type DbTargetInput } from "@/lib/types";
import { getStorage } from "@/lib/db/storage";
import { 
  createEphemeralExternalPool, 
  ensureSubmissionTables, 
  getExternalPool, 
  getPlatformSubmissionPool, 
  isSubmissionDbConfigured, 
  pingPool, 
  buildMysqlUrl 
} from "@/lib/db/platform";
import { decryptSecret } from "@/lib/security/crypto";
import { initializeWorkspace } from "./form-store";

export async function testDbTarget(input: DbTargetInput) {
  const url = buildMysqlUrl({
    host: input.host,
    port: input.port,
    user: input.user,
    password: input.password,
    databaseName: input.databaseName
  });

  const pool = createEphemeralExternalPool(url, 4000);

  try {
    await pingPool(pool);
    await ensureSubmissionTables(pool);
  } finally {
    await pool.end();
  }

  return { ok: true };
}

export async function setActiveDbTarget(workspaceId: string, input: DbTargetInput) {
  await initializeWorkspace(workspaceId);

  const url = buildMysqlUrl({
    host: input.host,
    port: input.port,
    user: input.user,
    password: input.password,
    databaseName: input.databaseName
  });

  const externalPool = getExternalPool(url);
  await pingPool(externalPool);
  await ensureSubmissionTables(externalPool);

  const result = await getStorage().dbTargets.setActiveDbTarget(workspaceId, input);

  await getStorage().audit.writeEvent(workspaceId, "system", "db_target.activated", {
    targetId: result.targetId,
    name: input.name,
    host: input.host,
    databaseName: input.databaseName
  });

  return result;
}

export async function getActiveDbTarget(workspaceId: string): Promise<DbTargetConfig | null> {
  return getStorage().dbTargets.getActiveDbTarget(workspaceId);
}

export async function getSubmissionPoolForWorkspace(workspaceId: string) {
  if (!isSubmissionDbConfigured()) {
    throw new Error("No submission database is configured.");
  }

  await ensureSubmissionTables(getPlatformSubmissionPool());

  const target = await getActiveDbTarget(workspaceId);
  if (!target || target.status !== "healthy") {
    return {
      pool: getPlatformSubmissionPool(),
      source: "platform" as const
    };
  }

  const url = buildMysqlUrl({
    host: target.host,
    port: target.port,
    user: target.user,
    password: decryptSecret(target.passwordEncrypted),
    databaseName: target.databaseName
  });

  const pool = getExternalPool(url);
  await ensureSubmissionTables(pool);

  return {
    pool,
    source: "external" as const,
    target
  };
}

export async function getReadableSubmissionPools(workspaceId: string) {
  if (!isSubmissionDbConfigured()) {
    return [] as { pool: ReturnType<typeof getPlatformSubmissionPool>; source: "platform" | "external" }[];
  }

  const pools: { pool: ReturnType<typeof getPlatformSubmissionPool>; source: "platform" | "external" }[] = [];

  const platformPool = getPlatformSubmissionPool();
  await ensureSubmissionTables(platformPool);
  pools.push({ pool: platformPool, source: "platform" });

  const target = await getActiveDbTarget(workspaceId);
  if (target && target.status === "healthy") {
    const url = buildMysqlUrl({
      host: target.host,
      port: target.port,
      user: target.user,
      password: decryptSecret(target.passwordEncrypted),
      databaseName: target.databaseName
    });

    const externalPool = getExternalPool(url);
    await ensureSubmissionTables(externalPool);

    if (externalPool !== platformPool) {
      pools.push({ pool: externalPool, source: "external" });
    }
  }

  return pools;
}
