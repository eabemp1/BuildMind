/**
 * lib/redditProof.ts - count the real replies on a founder's Reddit post, without any Reddit login.
 *
 * Reddit comment counts are the easiest number to inflate by typing, so BuildMind reads the thread itself.
 * Two things are needed: (1) that the post is the founder's, and (2) the number of distinct people who
 * commented. For (1) the founder posts a short code, derived from their account and the post, as a comment
 * on their own post: only the post's author can make that comment appear under the author's name. For (2)
 * BuildMind counts distinct commenters other than the author, ignoring deleted accounts and bots.
 *
 * Reddit often blocks server requests. When that happens this returns "unavailable" and the reflection
 * falls back to ordinary proof (a pasted link), so nothing breaks. Alt accounts can still comment, which
 * is why a Reddit count is trusted at proof level, not at the level of a payment.
 * Parsing and checking are pure and tested on fixtures; only fetchRedditThread touches the network.
 */

import { createHmac } from "node:crypto";

export interface RedditComment { author: string; body: string }
export interface RedditThread { postAuthor: string; comments: RedditComment[] }

const HOSTS = new Set(["reddit.com", "www.reddit.com", "old.reddit.com", "np.reddit.com", "new.reddit.com", "m.reddit.com"]);

/** The post id from a reddit post link, or null when it is not a post link. */
export function parseRedditPostId(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" || !HOSTS.has(u.hostname.toLowerCase())) return null;
  const m = u.pathname.match(/\/comments\/([a-z0-9]{5,10})(?:\/|$)/i);
  return m ? m[1].toLowerCase() : null;
}

export function redditOwnershipCode(userId: string, postId: string, secret = process.env.SIGNAL_SALT || process.env.CRON_SECRET || "buildmind"): string {
  return `bm-${createHmac("sha256", secret).update(`reddit|${userId}|${postId}`).digest("hex").slice(0, 8)}`;
}

const IGNORED = new Set(["[deleted]", "automoderator", "[removed]"]);

type Listing = { data?: { children?: Array<{ kind?: string; data?: Record<string, unknown> }> } };

/** Parses the JSON Reddit returns for /comments/<id>.json. Returns null for anything unexpected. */
export function parseRedditThread(json: unknown): RedditThread | null {
  if (!Array.isArray(json) || json.length < 2) return null;
  const post = (json[0] as Listing)?.data?.children?.[0]?.data;
  const postAuthor = typeof post?.author === "string" ? post.author : "";
  if (!postAuthor || IGNORED.has(postAuthor.toLowerCase())) return null;
  const comments: RedditComment[] = [];
  const walk = (children: Array<{ kind?: string; data?: Record<string, unknown> }> | undefined, depth: number) => {
    if (!children || depth > 12 || comments.length > 2000) return;
    for (const c of children) {
      if (c?.kind !== "t1" || !c.data) continue;
      comments.push({ author: typeof c.data.author === "string" ? c.data.author : "", body: typeof c.data.body === "string" ? c.data.body : "" });
      const replies = c.data.replies as Listing | "" | undefined;
      if (replies && typeof replies === "object") walk(replies.data?.children, depth + 1);
    }
  };
  walk((json[1] as Listing)?.data?.children, 0);
  return { postAuthor, comments };
}

export type RedditCheck =
  | { status: "verified"; count: number }
  | { status: "needs_code"; code: string };

/** Ownership holds when the post's author left a comment containing the code. Count = distinct other commenters. */
export function checkRedditThread(thread: RedditThread, code: string): RedditCheck {
  const op = thread.postAuthor.toLowerCase();
  const owned = thread.comments.some((c) => c.author.toLowerCase() === op && c.body.toLowerCase().includes(code.toLowerCase()));
  if (!owned) return { status: "needs_code", code };
  const others = new Set<string>();
  for (const c of thread.comments) {
    const a = c.author.toLowerCase();
    if (!a || a === op || IGNORED.has(a) || /bot$/.test(a)) continue;
    others.add(a);
  }
  return { status: "verified", count: others.size };
}

export async function fetchRedditThread(postId: string): Promise<RedditThread | null> {
  try {
    const res = await fetch(`https://www.reddit.com/comments/${postId}.json?limit=500&raw_json=1`, {
      headers: { "User-Agent": "web:buildmind.live:v1 (verifying a founder's own post)", Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return parseRedditThread(await res.json());
  } catch {
    return null;
  }
}

export type RedditVerdict =
  | { status: "not_reddit" }
  | { status: "unavailable" }
  | RedditCheck;

export async function verifyRedditProof(userId: string, url: string, fetchThread: typeof fetchRedditThread = fetchRedditThread): Promise<RedditVerdict> {
  const id = parseRedditPostId(url);
  if (!id) return { status: "not_reddit" };
  const thread = await fetchThread(id);
  if (!thread) return { status: "unavailable" };
  return checkRedditThread(thread, redditOwnershipCode(userId, id));
}
