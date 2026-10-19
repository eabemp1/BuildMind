/**
 * lib/prep/kinds.ts — what BuildMind can prepare for a Today task.
 *
 * A task is detected (deterministically, no model call) as one of a few kinds
 * of work. Each kind maps to a prepared first draft: messages to send, a post,
 * landing copy, an SEO brief, an investor update, a competitor brief, an
 * interview kit, a video script. The founder reviews and does the final human
 * act (send, post, publish). BuildMind never sends or posts anything itself.
 *
 * Pure and client-safe.
 */

export type PrepKind =
  | "outreach"
  | "post"
  | "landing"
  | "seo"
  | "investor_update"
  | "competitor_brief"
  | "validation_kit"
  | "video_script"
  | "build_plan"
  | "launch_plan"
  | "pricing_test"
  | "prospects";

/** content: drafted by the Distribution engine and improved from edits and results.
 *  research: grounded in live search or the founder's own record. */
export type PrepEngine = "content" | "research";

export interface PrepOutcome { id: string; label: string; positive: boolean }

export interface PrepMeta {
  label: string;
  /** Shown above the prepared work: what BuildMind did for you. */
  headline: string;
  engine: PrepEngine;
  /** The founder's final human act, used on the primary button. */
  doneVerb: string | null;
  /** What can happen after it is used. Null means nothing to track. */
  outcomes: PrepOutcome[] | null;
  /** True when the Distribution engine should record edits and results for this kind. */
  learns: boolean;
}

export const PREP_META: Record<PrepKind, PrepMeta> = {
  outreach: {
    label: "Outreach drafts", headline: "Three drafts, ready to send", engine: "content", doneVerb: "Mark sent", learns: true,
    outcomes: [
      { id: "replied", label: "Got a reply", positive: true },
      { id: "call_booked", label: "Booked a call", positive: true },
      { id: "no_reply", label: "No reply yet", positive: false },
    ],
  },
  post: {
    label: "Post draft", headline: "A first draft, ready to post", engine: "content", doneVerb: "Mark posted", learns: true,
    outcomes: [
      { id: "got_comments", label: "Got comments", positive: true },
      { id: "no_response", label: "No response", positive: false },
    ],
  },
  landing: { label: "Landing page copy", headline: "Landing page copy, drafted", engine: "content", doneVerb: "Mark published", outcomes: null, learns: true },
  seo: { label: "SEO brief", headline: "An SEO brief, grounded in what ranks now", engine: "content", doneVerb: "Mark published", outcomes: null, learns: true },
  investor_update: { label: "Investor update", headline: "An update from your real record", engine: "content", doneVerb: "Mark sent", outcomes: null, learns: true },
  competitor_brief: { label: "Competitor brief", headline: "A competitor brief, with sources", engine: "research", doneVerb: null, outcomes: null, learns: false },
  validation_kit: { label: "Interview kit", headline: "Your interview kit", engine: "research", doneVerb: null, outcomes: null, learns: false },
  video_script: { label: "Video script", headline: "A script and shot list", engine: "content", doneVerb: "Mark recorded", outcomes: null, learns: true },
  build_plan: { label: "Build plan", headline: "Today's build, cut down to the smallest useful version", engine: "content", doneVerb: null, outcomes: null, learns: false },
  launch_plan: {
    label: "Launch plan", headline: "A launch plan with titles and a first comment", engine: "content", doneVerb: "Mark launched", learns: true,
    outcomes: [
      { id: "got_comments", label: "Got comments", positive: true },
      { id: "no_response", label: "No response", positive: false },
    ],
  },
  pricing_test: { label: "Pricing test", headline: "A pricing test you can run this week", engine: "research", doneVerb: null, outcomes: null, learns: false },
  prospects: { label: "Prospect map", headline: "Where your first ten conversations are", engine: "research", doneVerb: null, outcomes: null, learns: false },
};

export const PREP_KINDS = Object.keys(PREP_META) as PrepKind[];

const RX = {
  landing: /\b(landing page|home ?page|hero (?:copy|section)|website copy|headline|above the fold)\b/i,
  seo: /\b(seo|keywords?|search (?:ranking|traffic|intent)|blog post|meta (?:title|description)|backlinks?|rank (?:for|on))\b/i,
  investor: /\b(investors?|fundrais\w*|pitch deck|traction update|metrics update|investor update|mrr|arr|kpis?)\b/i,
  video: /\b(video|reels?|tiktok|loom|screen ?record\w*|demo (?:clip|video|reel)|record (?:a|your))\b/i,
  pricing: /\b(pric(?:e|es|ing)|paywall|willingness to pay|subscription tiers?|charge (?:for|users|customers)|monetiz\w*|free (?:plan|tier)|packag(?:e|ing) (?:the )?plans?)\b/i,
  launch: /\b(launch|show hn|product hunt|go live|announce(?:ment)?|public release|beta release)\b/i,
  prospects: /\b(?:(?:find|identify|source|list|build a list of|make a list of)\s+(?:\d+|ten|five|some|the|more)?\s*(?:[\w-]+\s+){0,2}(?:people|users|customers|founders|communities|subreddits|groups|candidates|prospects|leads)|where (?:to find|do .{1,40} hang out)|who to (?:contact|reach|talk to))\b/i,
  build: /\b(build|implement|ship|code|refactor|fix|integrate|prioriti[sz]e|roadmap|decide (?:what|which)|feature|scope|mvp)\b/i,
  competitor: /\b(competitors?|competitive|alternatives|market research|landscape|benchmark\w*)\b/i,
  validation: /\b(interviews?|survey|validate|validation|customer discovery|talk to (?:users|founders|customers))\b/i,
  post: /\b(post|tweet|thread|publish|write (?:a|an) (?:post|article)|linkedin post)\b/i,
  outreach: /\b(dm|message|email|reach out|outreach|follow[- ]?up|cold|reply to|contact|ping)\b/i,
};

/**
 * Detects what to prepare. Specific content words win first, then the mission
 * planner's kind decides, then plain keywords. Returns null when there is
 * nothing useful to pre-draft (a build task, a decision, a reset).
 */
export function prepKindFor(task: string, missionKind?: string | null): PrepKind | null {
  const t = (task || "").trim();
  if (t.length < 4) return null;
  if (RX.landing.test(t)) return "landing";
  if (RX.seo.test(t)) return "seo";
  if (RX.investor.test(t)) return "investor_update";
  if (RX.video.test(t)) return "video_script";
  if (RX.competitor.test(t)) return "competitor_brief";
  if (RX.launch.test(t) && !/\b(follow|reply|dm|email)\b/i.test(t)) return "launch_plan";
  if (missionKind === "pricing" || RX.pricing.test(t)) return "pricing_test";
  if (RX.prospects.test(t)) return "prospects";
  if (missionKind === "outreach" || missionKind === "follow_up") return "outreach";
  if (missionKind === "interview") return "validation_kit";
  if (missionKind === "publish") return "post";
  if (missionKind === "reset") return null;
  if (missionKind === "build" || missionKind === "unblock") return "build_plan";
  if (RX.validation.test(t)) return "validation_kit";
  if (RX.outreach.test(t)) return "outreach";
  if (RX.post.test(t)) return "post";
  if (RX.build.test(t)) return "build_plan";
  return null;
}

/** Small stable hash (no crypto needed) so a task maps to one cached preparation per day. */
export function taskHash(task: string, kind: PrepKind): string {
  const s = `${kind}|${task.toLowerCase().replace(/\s+/g, " ").trim()}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0") + s.length.toString(16);
}

/** Kinds whose edits and results are learned together. */
export function familyOf(kind: PrepKind): string {
  return kind === "outreach" || kind === "post" ? "message" : kind;
}

export function inferPlatform(task: string): "linkedin" | "x" | "reddit" | "hn" | "other" {
  const t = task.toLowerCase();
  if (/linkedin/.test(t)) return "linkedin";
  if (/\b(reddit|r\/\w+|subreddit)\b/.test(t)) return "reddit";
  if (/\b(hacker ?news|hn)\b/.test(t)) return "hn";
  if (/\b(twitter|tweet|\bx\b)/.test(t)) return "x";
  return "other";
}

// ── Prepared payload ────────────────────────────────────────────────────────

export interface PrepVariant { id: string; label: string; text: string; why?: string }
export interface PrepSection { heading: string; body?: string; bullets?: string[]; links?: Array<{ title: string; url: string }> }
export interface PrepNeed { label: string; why: string; /** An app that would fill this gap. The Today panel offers to connect it right here. */ connect?: "stripe" | "github" | "search_console" }
export interface PrepFact { label: string; value: string }

export interface Prepared {
  kind: PrepKind;
  title: string;
  summary: string;
  platform?: string;
  variants: PrepVariant[];
  sections: PrepSection[];
  /** Real numbers from the founder's own record. Never invented. */
  facts: PrepFact[];
  /** What BuildMind could not do yet, and why. Shown plainly. */
  needs: PrepNeed[];
  /** What the Distribution engine learned from this founder and applied. */
  learned: string[];
  /** A video the founder recorded and linked (Loom or YouTube). */
  recorded?: { url: string; title: string; verified: boolean };
}

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Turns untrusted model JSON into a safe Prepared payload. Empty parts are dropped. */
export function normalizePrepared(raw: unknown, kind: PrepKind, extra: Partial<Pick<Prepared, "platform" | "facts" | "needs" | "learned">> = {}): Prepared {
  const r = (raw ?? {}) as Record<string, unknown>;
  const variants: PrepVariant[] = arr(r.variants).slice(0, 4).map((v, i) => {
    const o = (v ?? {}) as Record<string, unknown>;
    return { id: `v${i + 1}`, label: str(o.label, 40) || `Option ${i + 1}`, text: str(o.text, 4000), why: str(o.why, 300) || undefined };
  }).filter((v) => v.text);
  const sections: PrepSection[] = arr(r.sections).slice(0, 8).map((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const links = arr(o.links).slice(0, 6).map((l) => {
      const lo = (l ?? {}) as Record<string, unknown>;
      return { title: str(lo.title, 120), url: str(lo.url, 500) };
    }).filter((l) => /^https?:\/\//i.test(l.url) && l.title);
    const bullets = arr(o.bullets).slice(0, 10).map((b) => str(b, 400)).filter(Boolean);
    return { heading: str(o.heading, 80), body: str(o.body, 1500) || undefined, bullets: bullets.length ? bullets : undefined, links: links.length ? links : undefined };
  }).filter((s) => s.heading && (s.body || s.bullets || s.links));
  return {
    kind,
    title: str(r.title, 100) || PREP_META[kind].label,
    summary: str(r.summary, 300),
    platform: extra.platform,
    variants, sections,
    facts: extra.facts ?? [],
    needs: extra.needs ?? [],
    learned: extra.learned ?? [],
  };
}

/** A prepared payload is worth showing only when it has something to review. */
export function hasContent(p: Prepared): boolean {
  return p.variants.length > 0 || p.sections.length > 0 || p.facts.length > 0;
}
