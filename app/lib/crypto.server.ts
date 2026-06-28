import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

// Symmetric encryption for secrets at rest (API keys). AES-256-GCM gives us
// confidentiality + an auth tag so tampering is detected on decrypt.
//
// The 32-byte key comes from APP_ENCRYPTION_KEY (recommended:
// `openssl rand -base64 32`). If unset we derive one from SESSION_SECRET so dev
// and tests don't crash — but that ties key rotation to the cookie secret, so
// production should always set APP_ENCRYPTION_KEY explicitly.

const VERSION = "v1";
let cachedKey: Buffer | null = null;
let warned = false;

function masterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (raw && raw.trim()) {
    // Accept base64 or hex; fall back to deriving a 32-byte key from whatever
    // string was supplied so a short/odd value still works.
    const b64 = tryDecode(raw.trim(), "base64");
    const hex = tryDecode(raw.trim(), "hex");
    cachedKey =
      b64?.length === 32 ? b64 : hex?.length === 32 ? hex : derive(raw.trim());
  } else {
    if (!warned) {
      console.warn(
        "[crypto] APP_ENCRYPTION_KEY not set — deriving key from SESSION_SECRET. " +
          "Set APP_ENCRYPTION_KEY in production (openssl rand -base64 32).",
      );
      warned = true;
    }
    cachedKey = derive(process.env.SESSION_SECRET ?? "dev-secret-change-me");
  }
  return cachedKey;
}

function tryDecode(value: string, encoding: "base64" | "hex"): Buffer | null {
  try {
    const buf = Buffer.from(value, encoding);
    // base64/hex of wrong content can silently truncate; require non-empty.
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

function derive(secret: string): Buffer {
  // Fixed salt: this is a deterministic KDF, not password storage — the salt
  // only needs to be stable so the same secret always yields the same key.
  return scryptSync(secret, "slt-secret-encryption-v1", 32);
}

/** Encrypt a secret. Returns `v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(":");
}

/** Decrypt a value produced by {@link encryptSecret}. Throws if tampered. */
export function decryptSecret(stored: string): string {
  const [version, ivB64, tagB64, ctB64] = stored.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Malformed encrypted secret");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    masterKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return (
    decipher.update(Buffer.from(ctB64, "base64")).toString("utf8") +
    decipher.final("utf8")
  );
}

/** Non-secret display hint: a masked tail of the key, e.g. `"…a1b2"`. */
export function keyHint(plaintext: string): string {
  const tail = plaintext.slice(-4);
  return tail ? `…${tail}` : "…";
}
