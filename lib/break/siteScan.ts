/**
 * lib/break/siteScan.ts — read a live site and turn it into a founder brief.
 * Shared by the public /break scan and the signed-in Break My Startup scan.
 * Facts come only from the pages read; everything else is listed as unknown.
 */
import { readPage, readPages, type PageDigest } from "@/lib/pageReader";
import { callModelJSON } from "@/lib/ai-providers";
import { digestForPrompt, type SiteFacts } from "@/lib/break/domain";

export interface SiteBrief extends SiteFacts {
  domain: string;
  title: string;
  prices: string[];
  capabilities: string[];
  audiences: string[];
  unknowns: string[];
  /** Full pre-filled text for the signed-in form (<= 3800 chars). */
  brief: string;
  pagesRead: number;
}

const PROMPT = `You read a company's own website text and extract facts for a startup stress test. Return ONLY JSON:
{"overview":"1-2 plain sentences: what the product is and does","problem":"the problem it solves, only if the site says so, else \\"\\"","capabilities":["up to 6 things the site says the product does"],"audiences":["up to 5 groups the site says it is for, else []"]}
Use ONLY the text given. Never invent customers, numbers, traction or claims. Empty beats a guess. No marketing words.`;

const BASE_UNKNOWNS = [
  "Active users and shares/uses per user",
  "Activation: share of signups who complete the core action",
  "Repeat use within 7 and 30 days",
  "Acquisition channels that actually bring users",
  "Willingness to pay",
  "Costs to serve each user",
];

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
const strList = (v: unknown, n: number, len: number): string[] => (Array.isArray(v) ? v.map((x) => clip(String(x ?? ""), len)).filter((x) => x.length > 2).slice(0, n) : []);

export function composeBrief(b: Pick<SiteBrief, "domain" | "idea" | "problem" | "capabilities" | "audiences" | "prices" | "unknowns">): string {
  const lines: string[] = [`Website: https://${b.domain}`, "", `What it is (from the site): ${b.idea}`];
  if (b.problem) lines.push("", `Problem it says it solves: ${b.problem}`);
  if (b.capabilities.length) lines.push("", "What the site says it does:", ...b.capabilities.map((c) => `- ${c}`));
  if (b.audiences.length) lines.push("", "Who the site says it is for:", ...b.audiences.map((c) => `- ${c}`));
  if (b.prices.length) lines.push("", `Prices shown on the site: ${b.prices.join(", ")}`);
  lines.push("", "Not on the site (unknown, to validate, not a weakness by itself):", ...b.unknowns.map((u) => `- ${u}`));
  lines.push("", "Judge this on what the site says. Do not assume weak traction because it is new; say what evidence is missing.");
  return lines.join("\n").slice(0, 3800);
}

export async function scanSite(url: string, opts: { useAI: boolean }): Promise<SiteBrief | null> {
  const home = await readPage(url);
  if (!home.ok || (!home.title && !home.description && !home.text)) return null;
  const extra = (await readPages([`${url}/pricing`, `${url}/about`], 2)).filter((p): p is PageDigest => Boolean(p?.ok && p.text));
  const prices = [...new Set([...home.prices, ...extra.flatMap((p) => p.prices)])].slice(0, 6);
  const domain = new URL(url).hostname;

  let idea = clip(home.description || home.headings[0] || home.title, 400);
  let problem = "";
  let capabilities = home.headings.slice(1, 7).filter((h) => h.length > 5);
  let audiences: string[] = [];
  let source: "ai" | "page" = "page";

  if (opts.useAI) {
    try {
      const text = [digestForPrompt(home), ...extra.map((p) => `Page ${p.url}: ${p.description} ${p.text.slice(0, 900)}`)].join("\n\n").slice(0, 5200);
      const ai = await callModelJSON<{ overview?: string; problem?: string; capabilities?: unknown; audiences?: unknown }>(
        [{ role: "system", content: PROMPT }, { role: "user", content: text }],
        { role: "fast", temperature: 0.2, maxTokens: 700 },
      );
      const o = clip(String(ai?.overview ?? ""), 500);
      if (o.length >= 10) { idea = o; problem = clip(String(ai?.problem ?? ""), 400); capabilities = strList(ai?.capabilities, 6, 140); audiences = strList(ai?.audiences, 5, 90); source = "ai"; }
    } catch { /* page-only */ }
  }
  if (idea.length < 10) return null;
  const unknowns = BASE_UNKNOWNS.filter((u) => !(prices.length && u === "Willingness to pay"));
  const base = { domain, idea, problem, capabilities, audiences, prices, unknowns };
  return { ...base, targetUsers: audiences.slice(0, 2).join("; "), source, title: home.title, brief: composeBrief(base), pagesRead: 1 + extra.length };
}
