/**
 * lib/work/screenshot.ts — review a screenshot of a landing page or an app screen. Pure.
 * The model sees only the image and the founder's one-line note, so every point is about what is visible.
 */
export type ReviewKind = "landing" | "app";
export interface ScreenshotReview { summary: string; clear: string[]; problems: Array<{ what: string; why: string; fix: string }> }

const MIME = ["image/png", "image/jpeg", "image/webp"];
/** About 3 MB of image once decoded. The browser shrinks it first, so real uploads are far smaller. */
export const MAX_BASE64_CHARS = 4_000_000;

export function parseImage(dataUrl: unknown): { mimeType: string; data: string } | null {
  if (typeof dataUrl !== "string") return null;
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const mimeType = m[1].toLowerCase();
  if (!MIME.includes(mimeType) || m[2].length < 100 || m[2].length > MAX_BASE64_CHARS) return null;
  return { mimeType, data: m[2] };
}

const FOCUS: Record<ReviewKind, string> = {
  landing: "This is a screenshot of a landing page. Judge, as a stranger would in five seconds: can I tell what it is, who it is for, why I should care, and what to do next? Also look at: the headline, proof (only what is visible), the call to action, and anything that looks untrustworthy or cluttered.",
  app: "This is a screenshot of an app screen. Judge, as a first-time user would: is it clear what this screen is for, what the main action is, and what happens next? Also look at: labels, empty or error states, and anything that would confuse someone new.",
};

export function reviewPrompt(kind: ReviewKind, note: string): string {
  return `You are reviewing a screenshot for a solo founder. ${FOCUS[kind]}
${note ? `The founder says: ${note}\n` : ""}RULES
- Only describe what is visible in the image. If text is too small to read, say so; do not guess it.
- Do not invent numbers, customers, or what the product does beyond what the image shows.
- Do not give a score. Be specific: quote the visible words you are talking about.
- At most 3 things that already work and at most 4 problems, most important first. Each problem needs a concrete fix the founder can make today.
Return JSON only: {"summary":"one or two plain sentences","clear":["..."],"problems":[{"what":"...","why":"...","fix":"..."}]}`;
}

const line = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function normalizeReview(raw: unknown): ScreenshotReview | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const summary = line(o.summary, 300);
  const clear = (Array.isArray(o.clear) ? o.clear : []).map((x) => line(x, 200)).filter(Boolean).slice(0, 3);
  const problems = (Array.isArray(o.problems) ? o.problems : []).map((p) => {
    const r = (p ?? {}) as Record<string, unknown>;
    return { what: line(r.what, 200), why: line(r.why, 260), fix: line(r.fix, 260) };
  }).filter((p) => p.what && p.fix).slice(0, 4);
  if (!summary || (!problems.length && !clear.length)) return null;
  return { summary, clear, problems };
}
