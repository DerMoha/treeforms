import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const originalNodeEnv = process.env.NODE_ENV;
const originalAdminPassword = process.env.ADMIN_LOGIN_PASSWORD;
const originalAdminSessionSecret = process.env.ADMIN_SESSION_SECRET;

afterEach(() => {
  const env = process.env as Record<string, string | undefined>;

  if (originalNodeEnv === undefined) {
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = originalNodeEnv;
  }

  if (originalAdminPassword === undefined) {
    delete process.env.ADMIN_LOGIN_PASSWORD;
  } else {
    process.env.ADMIN_LOGIN_PASSWORD = originalAdminPassword;
  }

  if (originalAdminSessionSecret === undefined) {
    delete process.env.ADMIN_SESSION_SECRET;
  } else {
    process.env.ADMIN_SESSION_SECRET = originalAdminSessionSecret;
  }

  vi.resetModules();
});

describe("auth login route", () => {
  it("returns 503 when auth config is missing outside test mode", async () => {
    const env = process.env as Record<string, string | undefined>;

    env.NODE_ENV = "production";
    delete process.env.ADMIN_LOGIN_PASSWORD;
    delete process.env.ADMIN_SESSION_SECRET;

    vi.resetModules();

    const { POST } = await import("@/app/api/auth/login/route");

    const request = new NextRequest("http://127.0.0.1:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": "198.51.100.10"
      },
      body: JSON.stringify({
        password: "whatever",
        next: "/builder"
      })
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      error?: string;
    };

    expect(response.status).toBe(503);
    expect(payload.error).toBe("Authentication is temporarily unavailable.");
  });
});
