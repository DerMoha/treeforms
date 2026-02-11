import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { type NextRequest, type NextResponse } from "next/server";

import {
  ADMIN_SESSION_TTL_SECONDS,
  DEFAULT_WORKSPACE_ID,
  IS_PRODUCTION,
  adminLoginPassword,
  adminSessionSecret
} from "@/lib/server/constants";

export const ADMIN_SESSION_COOKIE = "tf_admin";
export const CSRF_COOKIE = "tf_csrf";
const ADMIN_PASSWORD = adminLoginPassword();
const ADMIN_SECRET = adminSessionSecret();

interface AdminSessionPayload {
  workspaceId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

export interface AdminSession {
  workspaceId: string;
  issuedAt: string;
  expiresAt: string;
}

export interface NewAdminSession {
  token: string;
  csrfToken: string;
  expiresAt: number;
}

export function createAdminSessionToken(): NewAdminSession {
  const issuedAt = nowSeconds();
  const expiresAt = issuedAt + ADMIN_SESSION_TTL_SECONDS;
  const payload: AdminSessionPayload = {
    workspaceId: DEFAULT_WORKSPACE_ID,
    issuedAt,
    expiresAt,
    nonce: randomBytes(12).toString("hex")
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signPayload(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    csrfToken: randomBytes(24).toString("base64url"),
    expiresAt
  };
}

export function readAdminSession(request: Pick<NextRequest, "cookies">): AdminSession | null {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    return null;
  }

  return {
    workspaceId: payload.workspaceId,
    issuedAt: new Date(payload.issuedAt * 1000).toISOString(),
    expiresAt: new Date(payload.expiresAt * 1000).toISOString()
  };
}

export function readCsrfCookie(request: Pick<NextRequest, "cookies">) {
  return request.cookies.get(CSRF_COOKIE)?.value?.trim() ?? "";
}

export function setAdminSessionCookies(
  response: NextResponse,
  session: NewAdminSession
) {
  response.cookies.set(ADMIN_SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    path: "/",
    expires: new Date(session.expiresAt * 1000)
  });

  response.cookies.set(CSRF_COOKIE, session.csrfToken, {
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    path: "/",
    expires: new Date(session.expiresAt * 1000)
  });
}

export function clearAdminSessionCookies(response: NextResponse) {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });

  response.cookies.set(CSRF_COOKIE, "", {
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
}

export function verifyAdminPassword(input: string) {
  const expected = createHash("sha256").update(ADMIN_PASSWORD).digest();
  const actual = createHash("sha256").update(input).digest();

  return timingSafeEqual(expected, actual);
}

function verifySessionToken(token: string): AdminSessionPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  if (!secureSignatureEquals(signature, expectedSignature)) {
    return null;
  }

  let payload: AdminSessionPayload;

  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as AdminSessionPayload;
  } catch {
    return null;
  }

  if (
    payload.workspaceId !== DEFAULT_WORKSPACE_ID ||
    !Number.isInteger(payload.issuedAt) ||
    !Number.isInteger(payload.expiresAt) ||
    payload.expiresAt <= nowSeconds() ||
    typeof payload.nonce !== "string" ||
    payload.nonce.length < 8
  ) {
    return null;
  }

  return payload;
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", ADMIN_SECRET)
    .update(encodedPayload)
    .digest("base64url");
}

function secureSignatureEquals(received: string, expected: string) {
  try {
    const receivedBuffer = Buffer.from(received, "base64url");
    const expectedBuffer = Buffer.from(expected, "base64url");

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(receivedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}
