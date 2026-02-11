import { NextRequest, NextResponse } from "next/server";

import { readAdminSession } from "@/lib/server/auth";
import { IS_PRODUCTION } from "@/lib/server/constants";

const DEFAULT_JSON_LIMIT_BYTES = 256 * 1024;

export function jsonOk(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    status: 200,
    ...init
  });
}

export function jsonError(message: string, status = 400, details?: unknown, init?: ResponseInit) {
  const shouldExposeDetails = status < 500 || !IS_PRODUCTION;

  return NextResponse.json(
    {
      error: message,
      details: shouldExposeDetails ? details ?? null : null
    },
    {
      status,
      ...init
    }
  );
}

export function workspaceIdFromRequest(request: NextRequest) {
  const session = readAdminSession(request);

  if (!session) {
    throw new HttpError(401, "Authentication required");
  }

  return session.workspaceId;
}

export async function readJson<T>(
  request: NextRequest,
  options: {
    maxBytes?: number;
    allowEmpty?: boolean;
  } = {}
): Promise<T> {
  const maxBytes = options.maxBytes ?? DEFAULT_JSON_LIMIT_BYTES;
  const raw = await request.text();
  const sizeBytes = Buffer.byteLength(raw, "utf8");

  if (sizeBytes > maxBytes) {
    throw new HttpError(413, "Request body is too large");
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    if (options.allowEmpty) {
      return {} as T;
    }
    throw new HttpError(400, "JSON body is required");
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export function handleRouteError(message: string, error: unknown) {
  if (error instanceof HttpError) {
    return jsonError(error.message, error.status, error.details);
  }

  console.error(message, error);
  return jsonError(message, 500);
}

export class HttpError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details: unknown = null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

export function normalizeSafeRedirect(target: string | undefined, fallback = "/builder") {
  if (!target) {
    return fallback;
  }

  if (!target.startsWith("/") || target.startsWith("//")) {
    return fallback;
  }

  return target;
}

export function parseNumberParam(
  value: string | null,
  fallback: number,
  bounds: { min: number; max: number }
) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new HttpError(400, "Invalid numeric query parameter");
  }

  if (parsed < bounds.min || parsed > bounds.max) {
    throw new HttpError(
      400,
      `Numeric query parameter must be between ${bounds.min} and ${bounds.max}`
    );
  }

  return parsed;
}

export function isMutationMethod(method: string) {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

export function requestIp(request: Pick<NextRequest, "headers">) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || "0.0.0.0";
}
