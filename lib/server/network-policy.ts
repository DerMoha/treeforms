import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import {
  DB_TARGET_TEST_ALLOWED_HOSTS,
  DB_TARGET_TEST_ALLOW_PRIVATE
} from "@/lib/server/constants";
import { HttpError } from "@/lib/server/http";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
  "169.254.169.254"
]);

export interface SafeDbTargetHost {
  host: string;
  resolvedAddresses: string[];
}

export async function assertSafeDbTargetHost(hostInput: string) {
  const host = normalizeHost(hostInput);

  if (!host) {
    throw new HttpError(400, "host is required");
  }

  const allowlisted = isAllowedHost(host);

  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new HttpError(400, "Host is not allowed for DB target testing");
  }

  const version = isIP(host);
  if (version > 0) {
    if (!allowlisted && !DB_TARGET_TEST_ALLOW_PRIVATE && isPrivateOrReservedIp(host, version)) {
      throw new HttpError(400, "Host resolves to a private or reserved IP range");
    }

    return {
      host,
      resolvedAddresses: [host]
    };
  }

  const addresses = await resolveHostAddresses(host);
  if (addresses.length === 0) {
    throw new HttpError(400, "Unable to resolve host");
  }

  if (!allowlisted && !DB_TARGET_TEST_ALLOW_PRIVATE) {
    const privateAddress = addresses.find((address) => {
      const addressVersion = isIP(address);
      return addressVersion > 0 && isPrivateOrReservedIp(address, addressVersion);
    });

    if (privateAddress) {
      throw new HttpError(400, "Host resolves to a private or reserved IP range");
    }
  }

  return {
    host,
    resolvedAddresses: addresses
  };
}

export async function assertStableDbTargetResolution(
  host: string,
  expectedAddresses: string[]
) {
  const expected = normalizeAddressList(expectedAddresses);
  const resolved = normalizeAddressList(await resolveHostAddresses(host));

  if (
    expected.length !== resolved.length ||
    expected.some((address, index) => address !== resolved[index])
  ) {
    throw new HttpError(400, "Host resolution changed during validation; retry the request");
  }

  return resolved;
}

export function assertSafeDbTargetPort(port: number) {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new HttpError(400, "port must be an integer between 1 and 65535");
  }

  return port;
}

function normalizeHost(host: string) {
  return host.trim().toLowerCase();
}

async function resolveHostAddresses(host: string) {
  const version = isIP(host);
  if (version > 0) {
    return [host];
  }

  try {
    const results = await lookup(host, {
      all: true,
      verbatim: true
    });

    return normalizeAddressList(results.map((entry) => entry.address));
  } catch {
    throw new HttpError(400, "Unable to resolve host");
  }
}

function normalizeAddressList(addresses: string[]) {
  return Array.from(new Set(addresses.map((entry) => entry.trim()).filter(Boolean))).sort();
}

function isAllowedHost(host: string) {
  if (DB_TARGET_TEST_ALLOWED_HOSTS.length === 0) {
    return false;
  }

  return DB_TARGET_TEST_ALLOWED_HOSTS.some((allowed) => {
    if (!allowed) {
      return false;
    }

    if (allowed.startsWith(".")) {
      return host.endsWith(allowed);
    }

    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

function isPrivateOrReservedIp(address: string, version: number) {
  if (version === 4) {
    return isPrivateIpv4(address);
  }

  if (version === 6) {
    return isPrivateIpv6(address);
  }

  return true;
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;

  if (a === 10 || a === 127 || a === 0) {
    return true;
  }

  if (a === 169 && b === 254) {
    return true;
  }

  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  if (a === 192 && b === 168) {
    return true;
  }

  if (a >= 224) {
    return true;
  }

  return false;
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();

  if (normalized === "::1" || normalized === "::") {
    return true;
  }

  if (normalized.startsWith("fe80:")) {
    return true;
  }

  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  if (normalized.startsWith("ff")) {
    return true;
  }

  return false;
}
