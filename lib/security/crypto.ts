import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { CREDENTIAL_KEY } from "@/lib/server/constants";

const IV_BYTES = 12;

function keyMaterial() {
  return createHash("sha256").update(CREDENTIAL_KEY).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(payload: string) {
  const [ivHex, tagHex, dataHex] = payload.split(":");

  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid secret payload format");
  }

  const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}
