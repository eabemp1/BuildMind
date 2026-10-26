/**
 * GitHub App connection: one click instead of a token. The founder installs BuildMind's GitHub App on one repository
 * with read-only access (Contents, Pull requests, Metadata). BuildMind stores only the installation number; a short
 * lived token is minted when needed. Needs five env vars: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_SLUG, GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET.
 * Unset, the app is simply not offered and the paste-a-token path keeps working.
 */
import { createSign } from "crypto";

export const APP_TOKEN_PREFIX = "ghapp:";

export function isGithubAppConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_SLUG &&
    process.env.GITHUB_APP_CLIENT_ID && process.env.GITHUB_APP_CLIENT_SECRET,
  );
}

/** Vercel stores multi-line keys with literal \n; accept both forms. */
export function normalisePem(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** The short-lived (10 minute) token GitHub asks an App to present. */
export function signAppJwt(appId: string, pem: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const head = b64({ alg: "RS256", typ: "JWT" });
  const body = b64({ iat: nowSec - 60, exp: nowSec + 9 * 60, iss: appId });
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(normalisePem(pem)).toString("base64url");
  return `${head}.${body}.${sig}`;
}

export const toStoredToken = (installationId: string | number) => `${APP_TOKEN_PREFIX}${installationId}`;
export function installationIdFrom(stored: string): string | null {
  return stored.startsWith(APP_TOKEN_PREFIX) && /^\d{1,15}$/.test(stored.slice(APP_TOKEN_PREFIX.length)) ? stored.slice(APP_TOKEN_PREFIX.length) : null;
}

const cache = new Map<string, { token: string; until: number }>();
const H = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "BuildMind" };

/** An installation access token (about an hour), or null when the App is not configured or GitHub says no. */
export async function mintInstallationToken(installationId: string): Promise<string | null> {
  const hit = cache.get(installationId);
  if (hit && hit.until > Date.now()) return hit.token;
  const appId = process.env.GITHUB_APP_ID, pem = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !pem) return null;
  try {
    const r = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
      method: "POST", headers: { ...H, Authorization: `Bearer ${signAppJwt(appId, pem)}` }, signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { token?: string };
    if (!j.token) return null;
    cache.set(installationId, { token: j.token, until: Date.now() + 50 * 60 * 1000 });
    return j.token;
  } catch { return null; }
}

export interface InstalledRepo { full_name: string; pushed_at?: string | null; private?: boolean }

export async function listInstallationRepos(token: string): Promise<InstalledRepo[]> {
  try {
    const r = await fetch("https://api.github.com/installation/repositories?per_page=50", { headers: { ...H, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!r.ok) return [];
    return ((await r.json()) as { repositories?: InstalledRepo[] }).repositories ?? [];
  } catch { return []; }
}

/** One repo is the connection. Prefer the one pushed to most recently. */
export function pickRepo(repos: InstalledRepo[]): string | null {
  if (!repos.length) return null;
  const sorted = [...repos].sort((a, b) => Date.parse(b.pushed_at ?? "") - Date.parse(a.pushed_at ?? "") || 0);
  return sorted[0].full_name;
}

/**
 * Proof that the person finishing the install really owns that installation. Installation numbers are guessable, so
 * the callback must not trust one that arrives in a URL: GitHub also sends a one-time `code` (the App is set to ask for
 * the user's authorization during installation). That code is exchanged for the user's token, and the installation must
 * appear in the list of installations that user can access.
 */
export async function userOwnsInstallation(code: string, installationId: string): Promise<boolean> {
  const id = process.env.GITHUB_APP_CLIENT_ID, secret = process.env.GITHUB_APP_CLIENT_SECRET;
  if (!id || !secret || !code) return false;
  try {
    const t = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "BuildMind" },
      body: JSON.stringify({ client_id: id, client_secret: secret, code }), signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    const tj = (await t.json()) as { access_token?: string };
    if (!t.ok || !tj.access_token) return false;
    const r = await fetch("https://api.github.com/user/installations?per_page=100", { headers: { ...H, Authorization: `Bearer ${tj.access_token}` }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!r.ok) return false;
    const list = ((await r.json()) as { installations?: Array<{ id: number }> }).installations ?? [];
    return list.some((i) => String(i.id) === installationId);
  } catch { return false; }
}
