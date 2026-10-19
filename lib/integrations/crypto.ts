/**
 * Keys pasted by founders (Stripe, GitHub) are stored encrypted, so a database
 * export alone never exposes them. AES-256-GCM; the key comes from
 * INTEGRATIONS_KEY, or is derived from the service role key if that is unset.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc1:";

function key(): Buffer {
  const secret = process.env.INTEGRATIONS_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!secret) throw new Error("No encryption secret configured");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${PREFIX}${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${ct.toString("base64url")}`;
}

/** Returns the plain text, or null if it cannot be decrypted. Legacy unencrypted tokens pass through. */
export function decryptSecret(stored: string): string | null {
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const [iv, tag, ct] = stored.slice(PREFIX.length).split(".");
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch { return null; }
}
