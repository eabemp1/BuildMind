/** Pure helpers for "scan my site" on /break. */
import type { PageDigest } from "@/lib/pageReader";

/** "https://www.Acme.com/pricing?x=1" -> "https://acme.com". Null when it is not a plausible public domain. */
export function normaliseDomain(raw: string): string | null {
  let t = String(raw ?? "").trim().toLowerCase();
  if (!t || t.length > 200 || /\s/.test(t)) return null;
  t = t.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(t) || t.length < 4) return null;
  return `https://${t}`;
}

export interface SiteFacts { idea: string; targetUsers: string; problem: string; source: "ai" | "page"; }

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

/** No-AI fallback: only what the page literally says. Never invents an audience or a problem. */
export function factsFromDigest(d: PageDigest): SiteFacts {
  const idea = clip([d.description || d.headings[0] || d.title].filter(Boolean).join(" "), 400);
  return { idea, targetUsers: "", problem: "", source: "page" };
}

/** The text handed to the model: the page, and nothing else. */
export function digestForPrompt(d: PageDigest): string {
  return [`Title: ${d.title}`, `Description: ${d.description}`, `Headings: ${d.headings.join(" | ")}`, `Text: ${d.text.slice(0, 2200)}`].join("\n");
}
