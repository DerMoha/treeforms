import { NextRequest, NextResponse } from "next/server";

import { createAdminSessionToken, setAdminSessionCookies, verifyAdminPassword } from "@/lib/server/auth";
import { applyRateLimit } from "@/lib/server/rate-limit";
import { loginInputSchema } from "@/lib/server/validation";
import { HttpError, normalizeSafeRedirect, readJson } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = applyRateLimit(request, {
      scope: "auth.login",
      limit: 10,
      windowMs: 60_000
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          details: null
        },
        {
          status: 429,
          headers: {
            "retry-after": String(rateLimit.retryAfterSeconds)
          }
        }
      );
    }

    const raw = await readJson<unknown>(request, {
      maxBytes: 8 * 1024
    });
    const parsed = loginInputSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid login payload",
          details: parsed.error.flatten()
        },
        { status: 400 }
      );
    }

    if (!verifyAdminPassword(parsed.data.password)) {
      return NextResponse.json(
        {
          error: "Invalid credentials",
          details: null
        },
        { status: 401 }
      );
    }

    const nextPath = normalizeSafeRedirect(parsed.data.next, "/builder");
    const session = createAdminSessionToken();
    const response = NextResponse.json(
      {
        ok: true,
        next: nextPath
      },
      { status: 200 }
    );
    setAdminSessionCookies(response, session);
    return response;
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        {
          error: error.message,
          details: error.details
        },
        { status: error.status }
      );
    }

    console.error("Unable to login", error);
    return NextResponse.json(
      {
        error: "Unable to login",
        details: null
      },
      { status: 500 }
    );
  }
}
