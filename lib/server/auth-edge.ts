import { type NextRequest } from "next/server";

import { DEFAULT_WORKSPACE_ID, adminSessionSecret } from "@/lib/server/constants";
import { toAuthConfigError } from "@/lib/server/auth-config";

const ADMIN_SESSION_COOKIE = "tf_admin";
let cachedSecret: string | null = null;

export function assertAdminSessionEdgeConfig() {
  void adminSecret();
}

export async function readAdminSessionEdge(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await signPayload(encodedPayload);
  if (!secureEquals(signature, expectedSignature)) {
    return null;
  }

  const payload = decodePayload(encodedPayload);
  if (!payload) {
    return null;
  }

  if (
    payload.workspaceId !== DEFAULT_WORKSPACE_ID ||
    !Number.isInteger(payload.issuedAt) ||
    !Number.isInteger(payload.expiresAt) ||
    payload.expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return payload;
}

async function signPayload(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(adminSecret()),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

function decodePayload(encodedPayload: string) {
  try {
    const json = decodeUtf8(base64UrlDecode(encodedPayload));
    return JSON.parse(json) as {
      workspaceId: string;
      issuedAt: number;
      expiresAt: number;
      nonce: string;
    };
  } catch {
    return null;
  }
}

function secureEquals(a: string, b: string) {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);

  if (aBytes.length !== bBytes.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < aBytes.length; index += 1) {
    mismatch |= aBytes[index] ^ bBytes[index];
  }

  return mismatch === 0;
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const suffix = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + suffix);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

function adminSecret() {
  if (cachedSecret) {
    return cachedSecret;
  }

  try {
    cachedSecret = adminSessionSecret();
    return cachedSecret;
  } catch (error) {
    const mapped = toAuthConfigError("ADMIN_SESSION_SECRET", error);
    if (mapped) {
      throw mapped;
    }
    throw error;
  }
}
