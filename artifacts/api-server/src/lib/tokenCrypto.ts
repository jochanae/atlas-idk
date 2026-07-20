import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const PREFIX = "enc:v1:";
const BINDING_PREFIX = "bnd:v1:";
const ALGO = "aes-256-gcm";

function getKey(salt: string): Buffer {
  const secret = process.env.SESSION_SECRET ?? "fallback-dev-key-not-for-production";
  return scryptSync(secret, salt, 32) as Buffer;
}

// ── GitHub PAT encryption ────────────────────────────────────────────────────
// Uses a PAT-specific salt so PAT keys and binding keys are always distinct,
// even if they share the same SESSION_SECRET source material.

export function encryptToken(plain: string): string {
  const key = getKey("atlas-pat-salt-v1");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}

export function decryptToken(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return stored;
  const [ivHex, tagHex, ctHex] = parts as [string, string, string];
  try {
    const key = getKey("atlas-pat-salt-v1");
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const plain = Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return stored;
  }
}

// ── Service binding encryption ────────────────────────────────────────────────
// Dedicated key salt, separate from PAT encryption.
// Versioned JSON envelope: { version, iv, authTag, ciphertext } — all base64.
// A version field gives a future migration path to a dedicated key or KMS
// without invalidating every existing binding.
// IV is always a fresh cryptographically random 12-byte value per encryption.
// Returns null on any decryption failure so callers can skip without logging ciphertext.

interface BindingEnvelope {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export function encryptBinding(plain: string): string {
  const key = getKey("atlas-binding-key-v1");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope: BindingEnvelope = {
    version: 1,
    iv: iv.toString("base64"),
    authTag: tag.toString("base64"),
    ciphertext: ct.toString("base64"),
  };
  return `${BINDING_PREFIX}${Buffer.from(JSON.stringify(envelope)).toString("base64")}`;
}

export function decryptBinding(stored: string): string | null {
  if (!stored.startsWith(BINDING_PREFIX)) return null;
  const encoded = stored.slice(BINDING_PREFIX.length);
  try {
    const envelope = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as BindingEnvelope;
    if (envelope.version !== 1) return null;
    const key = getKey("atlas-binding-key-v1");
    const iv = Buffer.from(envelope.iv, "base64");
    const tag = Buffer.from(envelope.authTag, "base64");
    const ct = Buffer.from(envelope.ciphertext, "base64");
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    // AES-GCM authentication failure (tampered ciphertext) or malformed envelope.
    // Return null — never return the ciphertext or any key material.
    return null;
  }
}
