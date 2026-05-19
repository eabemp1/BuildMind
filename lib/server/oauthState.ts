import { createHmac, timingSafeEqual } from "crypto";

type OAuthStatePayload = {
  userId?: string;
  exp?: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getStateSecret(): string {
  return (
    process.env.OAUTH_STATE_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ""
  );
}

function base64UrlDecode(value: string): string {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyOAuthState(state: string | null): string | null {
  if (!state) return null;

  const [encodedPayload, signature] = state.split(".");
  const secret = getStateSecret();
  if (encodedPayload && signature && secret) {
    const expected = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
    if (!safeEqual(signature, expected)) return null;

    try {
      const payload = JSON.parse(base64UrlDecode(encodedPayload)) as OAuthStatePayload;
      if (!payload.userId || !UUID_RE.test(payload.userId)) return null;
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
      return payload.userId;
    } catch {
      return null;
    }
  }

  if (process.env.NODE_ENV !== "production" && UUID_RE.test(state)) {
    return state;
  }

  return null;
}
