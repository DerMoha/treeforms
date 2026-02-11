export const DEFAULT_WORKSPACE_ID = process.env.DEFAULT_WORKSPACE_ID ?? "workspace_demo";
export const DEFAULT_WORKSPACE_NAME = process.env.DEFAULT_WORKSPACE_NAME ?? "Demo Workspace";

export const APP_DB_URL = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
export const PLATFORM_SUBMISSION_DB_URL =
  process.env.SUBMISSION_DATABASE_URL ?? process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const IS_TEST = process.env.NODE_ENV === "test";

export const ADMIN_SESSION_TTL_SECONDS = readIntEnv("ADMIN_SESSION_TTL_SECONDS", 28_800, {
  min: 60
});
export const RESPONDENT_SESSION_TTL_SECONDS = readIntEnv("RESPONDENT_SESSION_TTL_SECONDS", 86_400, {
  min: 300
});

export const PUBLIC_API_CORS_ORIGINS = readCsvEnv("PUBLIC_API_CORS_ORIGINS");
export const DB_TARGET_TEST_ALLOWED_HOSTS = readCsvEnv("DB_TARGET_TEST_ALLOWED_HOSTS");
export const DB_TARGET_TEST_ALLOW_PRIVATE = process.env.DB_TARGET_TEST_ALLOW_PRIVATE === "1";
export const TRUST_X_FORWARDED_FOR = process.env.TRUST_X_FORWARDED_FOR === "1";

let cachedCredentialKey: string | null = null;

export function credentialEncryptionKey() {
  if (cachedCredentialKey) {
    return cachedCredentialKey;
  }

  cachedCredentialKey = requireMinLengthSecret(
    "CREDENTIAL_ENCRYPTION_KEY",
    32,
    "test-credential-encryption-key-32-bytes"
  );
  return cachedCredentialKey;
}

export function adminLoginPassword() {
  return requireMinLengthSecret("ADMIN_LOGIN_PASSWORD", 1, "test-admin-password");
}

export function adminSessionSecret() {
  return requireMinLengthSecret(
    "ADMIN_SESSION_SECRET",
    32,
    "test-admin-session-secret-32-characters"
  );
}

function requireMinLengthSecret(name: string, minLength: number, testFallback: string) {
  const value = process.env[name]?.trim();

  if (value && value.length >= minLength) {
    return value;
  }

  if (IS_TEST) {
    return testFallback;
  }

  throw new Error(`${name} must be set and at least ${minLength} characters long.`);
}

function readIntEnv(
  name: string,
  fallback: number,
  limits: {
    min: number;
    max?: number;
  }
) {
  const value = process.env[name]?.trim();

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  const integer = Number.isInteger(parsed);
  const withinMin = parsed >= limits.min;
  const withinMax = limits.max === undefined || parsed <= limits.max;

  if (integer && withinMin && withinMax) {
    return parsed;
  }

  if (IS_TEST) {
    return fallback;
  }

  const maxPart = limits.max === undefined ? "" : ` and at most ${limits.max}`;
  throw new Error(`${name} must be an integer at least ${limits.min}${maxPart}.`);
}

function readCsvEnv(name: string) {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return [] as string[];
  }

  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}
