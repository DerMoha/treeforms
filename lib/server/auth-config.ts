export class AuthConfigError extends Error {
  configName: string;

  constructor(configName: string) {
    super("Authentication is temporarily unavailable.");
    this.name = "AuthConfigError";
    this.configName = configName;
  }
}

export function isAuthConfigError(error: unknown): error is AuthConfigError {
  return error instanceof AuthConfigError;
}

export function toAuthConfigError(configName: string, error: unknown) {
  if (error instanceof AuthConfigError) {
    return error;
  }

  if (error instanceof Error && error.message.startsWith(`${configName} must be set`)) {
    return new AuthConfigError(configName);
  }

  return null;
}
