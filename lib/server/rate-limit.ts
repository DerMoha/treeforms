import { type NextRequest } from "next/server";

import { requestIp } from "@/lib/server/http";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __TREEFORMS_RATE_LIMIT_BUCKETS: Map<string, RateLimitBucket> | undefined;
}

const buckets = globalThis.__TREEFORMS_RATE_LIMIT_BUCKETS ?? new Map<string, RateLimitBucket>();
globalThis.__TREEFORMS_RATE_LIMIT_BUCKETS = buckets;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function applyRateLimit(
  request: NextRequest,
  config: {
    scope: string;
    limit: number;
    windowMs: number;
    keySuffix?: string;
  }
): RateLimitResult {
  const now = Date.now();
  const ip = requestIp(request);
  const key = `${config.scope}:${ip}:${config.keySuffix ?? "-"}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + config.windowMs
    });

    cleanupExpiredBuckets(now);
    return {
      allowed: true,
      retryAfterSeconds: 0
    };
  }

  if (existing.count >= config.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    };
  }

  existing.count += 1;
  buckets.set(key, existing);

  return {
    allowed: true,
    retryAfterSeconds: 0
  };
}

function cleanupExpiredBuckets(now: number) {
  if (buckets.size < 3000) {
    return;
  }

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}
