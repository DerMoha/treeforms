import { describe, expect, it } from "vitest";
import { computeExpiry, isExpired, nowIso } from "@/lib/utils/datetime";

describe("datetime utils", () => {
  it("nowIso returns a valid ISO string", () => {
    const now = nowIso();
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });

  it("computeExpiry calculates correct future date", () => {
    const seconds = 3600;
    const now = Date.now();
    const expiry = computeExpiry(seconds);
    const expiryTime = new Date(expiry).getTime();
    
    // Allow 2 second margin for execution time
    expect(expiryTime).toBeGreaterThanOrEqual(now + seconds * 1000);
    expect(expiryTime).toBeLessThanOrEqual(now + (seconds + 2) * 1000);
  });

  it("isExpired correctly identifies expired dates", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 10000).toISOString();
    
    expect(isExpired(past)).toBe(true);
    expect(isExpired(future)).toBe(false);
  });
});
