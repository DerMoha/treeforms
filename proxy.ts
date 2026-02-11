import { NextRequest, NextResponse } from "next/server";

import { readAdminSessionEdge } from "@/lib/server/auth-edge";
import { PUBLIC_API_CORS_ORIGINS } from "@/lib/server/constants";

const API_PREFIX = "/api/";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const response = handleCorsAndPreflight(request);

  if (response) {
    applySecurityHeaders(response);
    return response;
  }

  if (isProtectedPath(pathname)) {
    const session = await readAdminSessionEdge(request);

    if (!session) {
      if (pathname.startsWith(API_PREFIX)) {
        const unauthorized = NextResponse.json(
          {
            error: "Authentication required",
            details: null
          },
          { status: 401 }
        );
        applySecurityHeaders(unauthorized);
        return unauthorized;
      }

      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", `${pathname}${search}`);
      const redirected = NextResponse.redirect(loginUrl);
      applySecurityHeaders(redirected);
      return redirected;
    }
  }

  const next = NextResponse.next();
  applyCorsHeaders(request, next);
  applySecurityHeaders(next);
  return next;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};

function isProtectedPath(pathname: string) {
  return (
    pathname === "/builder" ||
    pathname.startsWith("/builder/") ||
    pathname === "/api/forms" ||
    pathname.startsWith("/api/forms/") ||
    pathname === "/api/workspaces" ||
    pathname.startsWith("/api/workspaces/")
  );
}

function handleCorsAndPreflight(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith(API_PREFIX)) {
    return null;
  }

  const origin = request.headers.get("origin")?.trim();
  if (origin && !isAllowedOrigin(origin, request)) {
    return NextResponse.json(
      {
        error: "Origin is not allowed",
        details: null
      },
      { status: 403 }
    );
  }

  if (request.method !== "OPTIONS") {
    return null;
  }

  const preflight = new NextResponse(null, {
    status: 204
  });
  applyCorsHeaders(request, preflight);
  return preflight;
}

function applyCorsHeaders(request: NextRequest, response: NextResponse) {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith(API_PREFIX)) {
    return;
  }

  const origin = request.headers.get("origin")?.trim();
  if (!origin || !isAllowedOrigin(origin, request)) {
    return;
  }

  response.headers.set("access-control-allow-origin", origin);
  response.headers.set("access-control-allow-credentials", "true");
  response.headers.set(
    "access-control-allow-methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  response.headers.set("access-control-allow-headers", "content-type,x-csrf-token");
  response.headers.set("vary", "Origin");
}

function isAllowedOrigin(origin: string, request: NextRequest) {
  const normalizedOrigin = origin.toLowerCase();
  const sameOrigin = normalizedOrigin === request.nextUrl.origin.toLowerCase();

  if (sameOrigin) {
    return true;
  }

  if (PUBLIC_API_CORS_ORIGINS.length === 0) {
    return false;
  }

  return PUBLIC_API_CORS_ORIGINS.includes(normalizedOrigin);
}

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("content-security-policy", buildCspValue());
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()"
  );
}

function buildCspValue() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'"
  ].join("; ");
}
