/**
 * GitHub, read-only, one repository. Gives BuildMind what you actually shipped,
 * so investor updates, posts and demo scripts are about real work.
 */
import type { PrepFact } from "@/lib/prep/kinds";
import { installationIdFrom, mintInstallationToken } from "@/lib/integrations/githubApp";

export interface GithubSummary {
  asOf: string;
  repo: string;
  commits30d: number;
  mergedPRs30d: number;
  shipped: string[];
  truncated: boolean;
}

export const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

/**
 * Accepts what a non-developer actually has: the address bar ("https://github.com/owner/name", with or without a
 * trailing path, .git or query), "github.com/owner/name", or "owner/name". Returns "owner/name" or null.
 */
export function parseRepo(input: string): string | null {
  let t = input.trim();
  if (!t) return null;
  t = t.replace(/^git@github\.com:/i, "").replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "");
  t = t.split(/[?#]/)[0].replace(/\/+$/, "");
  const parts = t.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const name = parts[1].replace(/\.git$/i, "");
  const out = `${parts[0]}/${name}`;
  return REPO_RE.test(out) ? out : null;
}

export function checkGithubInput(token: string, repo: string): { ok: true } | { ok: false; reason: string } {
  if (!/^(github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,})$/.test(token.trim())) return { ok: false, reason: "That does not look like a GitHub token. Fine-grained tokens start with github_pat_." };
  if (!REPO_RE.test(repo.trim())) return { ok: false, reason: "Enter the repository as owner/name, for example Shinobi7Kami/BuildMind." };
  return { ok: true };
}

/** Commit-style prefixes and noise removed so a title reads as something shipped. */
export function cleanShipped(title: string): string {
  return title.replace(/^(?:feat|fix|chore|docs|refactor|perf|test|build|ci)(?:\([^)]*\))?!?:\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 90);
}

interface Pull { title?: string; merged_at?: string | null }

export function summariseGithub(repo: string, commitCount: number, pulls: Pull[], now = new Date(), truncated = false): GithubSummary {
  const cutoff = now.getTime() - 30 * 86400000;
  const merged = pulls.filter((p) => p.merged_at && new Date(p.merged_at).getTime() >= cutoff);
  const seen = new Set<string>();
  const shipped: string[] = [];
  for (const p of merged) {
    const t = cleanShipped(p.title ?? "");
    if (t.length < 8 || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase()); shipped.push(t);
    if (shipped.length >= 8) break;
  }
  return { asOf: now.toISOString(), repo, commits30d: commitCount, mergedPRs30d: merged.length, shipped, truncated };
}

export function githubFacts(s: GithubSummary): PrepFact[] {
  const plus = s.truncated ? "+" : "";
  const f: PrepFact[] = [{ label: `Commits to ${s.repo}, last 30 days`, value: `${s.commits30d}${plus}` }];
  if (s.mergedPRs30d) f.push({ label: "Pull requests merged, last 30 days", value: `${s.mergedPRs30d}${plus}` });
  return f;
}

async function gh<T>(path: string, token: string): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    const r = await fetch(`https://api.github.com${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "BuildMind" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, data: (await r.json()) as T };
  } catch { return { ok: false, status: 0 }; }
}

export type GithubFetch = { ok: true; summary: GithubSummary } | { ok: false; kind: "auth" | "not_found" | "network"; message: string };

export async function fetchGithubSummary(stored: string, repo: string): Promise<GithubFetch> {
  // "ghapp:<installation>" means the founder connected with one click: mint a short-lived token instead of using a pasted one.
  const installation = installationIdFrom(stored.trim());
  let token = stored;
  if (installation) {
    const minted = await mintInstallationToken(installation);
    if (!minted) return { ok: false, kind: "auth", message: "GitHub no longer lets BuildMind read this repository. Connect it again." };
    token = minted;
    if (!REPO_RE.test(repo.trim())) return { ok: false, kind: "auth", message: "Enter the repository as owner/name." };
  } else {
    const chk = checkGithubInput(token, repo);
    if (!chk.ok) return { ok: false, kind: "auth", message: chk.reason };
  }
  const t = token.trim(); const r = repo.trim();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [commits, pulls] = await Promise.all([
    gh<unknown[]>(`/repos/${r}/commits?since=${encodeURIComponent(since)}&per_page=100`, t),
    gh<Pull[]>(`/repos/${r}/pulls?state=closed&sort=updated&direction=desc&per_page=50`, t),
  ]);
  for (const x of [commits, pulls]) {
    if (!x.ok) {
      if (x.status === 401) return { ok: false, kind: "auth", message: "GitHub rejected that token. It may have expired." };
      if (x.status === 403 || x.status === 404) return { ok: false, kind: "not_found", message: "That token cannot see this repository. Give it read access to Contents and Pull requests for this repo only." };
      return { ok: false, kind: "network", message: "Could not reach GitHub. Try again in a moment." };
    }
  }
  const c = (commits as { ok: true; data: unknown[] }).data;
  return { ok: true, summary: summariseGithub(r, c.length, (pulls as { ok: true; data: Pull[] }).data, new Date(), c.length >= 100) };
}
