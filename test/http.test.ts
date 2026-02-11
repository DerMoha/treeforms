import { afterEach, describe, expect, it, vi } from "vitest";

const originalTrustXForwardedFor = process.env.TRUST_X_FORWARDED_FOR;

afterEach(() => {
  if (originalTrustXForwardedFor === undefined) {
    delete process.env.TRUST_X_FORWARDED_FOR;
  } else {
    process.env.TRUST_X_FORWARDED_FOR = originalTrustXForwardedFor;
  }
});

describe("server http helpers", () => {
  it("rejects oversized requests by content-length before parsing", async () => {
    const { readJson } = await importHttpModule();
    const request = makeStreamRequest(["{\"ok\":true}"], {
      "content-length": "1024"
    });

    await expect(
      readJson(request as never, {
        maxBytes: 32
      })
    ).rejects.toMatchObject({ status: 413 });
  });

  it("rejects oversized streamed requests without content-length", async () => {
    const { readJson } = await importHttpModule();
    const request = makeStreamRequest(["{\"value\":\"", "1234567890", "\"}"]);

    await expect(
      readJson(request as never, {
        maxBytes: 8
      })
    ).rejects.toMatchObject({ status: 413 });
  });

  it("parses valid streamed JSON payloads", async () => {
    const { readJson } = await importHttpModule();
    const request = makeStreamRequest(["{\"value\":", "42}"]);

    await expect(
      readJson<{ value: number }>(request as never, {
        maxBytes: 64
      })
    ).resolves.toEqual({ value: 42 });
  });

  it("ignores x-forwarded-for by default and uses x-real-ip", async () => {
    const { requestIp } = await importHttpModule();
    const ip = requestIp({
      headers: new Headers({
        "x-forwarded-for": "203.0.113.11, 203.0.113.12",
        "x-real-ip": "198.51.100.25"
      })
    } as never);

    expect(ip).toBe("198.51.100.25");
  });

  it("uses x-forwarded-for when TRUST_X_FORWARDED_FOR=1", async () => {
    const { requestIp } = await importHttpModule("1");
    const ip = requestIp({
      headers: new Headers({
        "x-forwarded-for": "203.0.113.11, 203.0.113.12",
        "x-real-ip": "198.51.100.25"
      })
    } as never);

    expect(ip).toBe("203.0.113.11");
  });
});

function makeStreamRequest(chunks: string[], headers?: Record<string, string>) {
  const encoder = new TextEncoder();

  return {
    headers: new Headers(headers),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      }
    })
  };
}

async function importHttpModule(trustXForwardedFor?: string) {
  vi.resetModules();

  if (trustXForwardedFor === undefined) {
    delete process.env.TRUST_X_FORWARDED_FOR;
  } else {
    process.env.TRUST_X_FORWARDED_FOR = trustXForwardedFor;
  }

  return import("@/lib/server/http");
}
