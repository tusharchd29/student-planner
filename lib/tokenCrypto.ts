import crypto from "crypto";

// Encrypts Google OAuth tokens before they're stored in Postgres, and
// decrypts them on the way out. Deliberately done at the application layer
// with a key that only ever lives in Vercel's env vars — never in the
// database itself — rather than using pgcrypto/Vault functions where the
// key would have to pass through a SQL query to be usable.
//
// Requires TOKEN_ENCRYPTION_KEY: a 32-byte key, base64-encoded. Generate
// one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set — cannot encrypt/decrypt stored tokens"
    );
  }
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return buf;
}

// Output format: "v1:<iv-base64>:<authtag-base64>:<ciphertext-base64>"
// The "v1" prefix exists so we can change the scheme later without
// breaking old rows.
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV, standard for GCM
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${authTag.toString(
    "base64"
  )}:${ciphertext.toString("base64")}`;
}

export function decryptToken(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Unrecognized token encryption format");
  }
  const [, ivB64, tagB64, ciphertextB64] = parts;
  const key = getKey();
  const decipher = crypto.createDecipheriv(
    ALGO,
    key,
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
