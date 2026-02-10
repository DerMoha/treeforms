export const DEFAULT_WORKSPACE_ID = process.env.DEFAULT_WORKSPACE_ID ?? "workspace_demo";
export const DEFAULT_WORKSPACE_NAME = process.env.DEFAULT_WORKSPACE_NAME ?? "Demo Workspace";

export const APP_DB_URL = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
export const PLATFORM_SUBMISSION_DB_URL =
  process.env.SUBMISSION_DATABASE_URL ?? process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

export const CREDENTIAL_KEY =
  process.env.CREDENTIAL_ENCRYPTION_KEY ?? "treeforms-dev-key-32-bytes-minimum!!!!";
