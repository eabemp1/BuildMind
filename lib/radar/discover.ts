/**
 * lib/radar/discover.ts — find opportunities for THIS founder.
 * Queries are built from their stage, product and place, not typed by hand.
 * Results are classified by rule, must match the kind that was searched for,
 * must have a real future date backed by the page text, and are scored with
 * the same fit as everything else. Every step reports what it dropped.
 */
import { tokenize, stem } from "@/lib/taxonomy/taskTaxonomy";
import { stageBandOf } from "@/lib/radar/fit";
import { classifyOpportunity, hostOf } from "@/lib/radar/classify";
import type { RadarKind } from "@/lib/radar/types";

const SEARCHABLE: RadarKind[] = ["hackathon", "grant", "accelerator", "competition", "conference", "meetup", "workshop"];
const WORD: Record<string, string> = { hackathon: "hackathon", grant: "startup grant applications open", accelerator: "startup accelerator applications", competition: "startup pitch competition", conference: "startup conference", meetup: "founders meetup", workshop: "startup workshop" };
const STAGE_KINDS: Record<string, RadarKind[]> = {
  idea: ["meetup", "workshop", "hackathon"], validation: ["meetup", "accelerator", "workshop"], building: ["hackathon", "accelerator", "grant"],
  launch: ["competition", "accelerator", "grant"], growth: ["grant", "conference", "competition"],
};
const STOP = new Set(["that", "this", "with", "from", "your", "their", "tool", "app", "platform", "startup", "founders", "founder", "help", "helps", "build", "builds", "daily", "users", "people", "make", "makes", "using", "based", "system", "product", "solo"]);
const SKIP_HOSTS = /(?:^|\.)(?:facebook\.com|instagram\.com|pinterest\.com|reddit\.com|quora\.com|youtube\.com|medium\.com|linkedin\.com)$/i;

export interface Query { kind: RadarKind; q: string }

export function topicTerms(text: string, n = 2): string[] {
  const count = new Map<string, number>();
  for (const w of text.toLowerCase().match(/[a-z]{5,}/g) ?? []) { if (!STOP.has(w)) count.set(w, (count.get(w) ?? 0) + 1); }
  void tokenize; void stem;
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([w]) => w);
}

export function buildQueries(project: { stage: string; name: string; description: string; problem: string; targetUsers: string }, where: string, now = Date.now()): Query[] {
  const kinds = (STAGE_KINDS[stageBandOf(project.stage)] ?? STAGE_KINDS.validation).filter((k) => SEARCHABLE.includes(k));
  const topic = topicTerms([project.description, project.problem, project.targetUsers].join(" "), 1)[0] ?? "";
  const y = new Date(now).getUTCFullYear();
  const years = new Date(now).getUTCMonth() >= 8 ? `${y} ${y + 1}` : `${y}`;
  const place = where.trim() || "online";
  return kinds.slice(0, 4).map((kind) => ({ kind, q: [WORD[kind], topic, place, years].filter(Boolean).join(" ") }));
}

export interface Hit { title: string; url: string; snippet: string }
export interface Candidate extends Hit { wanted: RadarKind }

/** Drops what should never reach the founder: seen links, junk hosts, and results whose own text says they are a different kind of thing. */
export function pickCandidates(hits: Array<{ wanted: RadarKind; hits: Hit[] }>, seenUrls: Set<string>, max = 6): { picked: Candidate[]; dropped: { seen: number; junk: number; wrongKind: number } } {
  const dropped = { seen: 0, junk: 0, wrongKind: 0 };
  const picked: Candidate[] = [];
  const seenHere = new Set<string>();
  for (const group of hits) {
    for (const h of group.hits) {
      if (!/^https?:\/\//.test(h.url)) { dropped.junk++; continue; }
      const key = h.url.replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
      if (seenUrls.has(key) || seenUrls.has(h.url) || seenHere.has(key)) { dropped.seen++; continue; }
      if (SKIP_HOSTS.test(hostOf(h.url))) { dropped.junk++; continue; }
      const c = classifyOpportunity({ title: h.title, text: h.snippet, url: h.url });
      if (c.kind !== group.wanted && !c.alternatives.includes(group.wanted)) { dropped.wrongKind++; continue; }
      seenHere.add(key);
      picked.push({ ...h, wanted: group.wanted });
    }
  }
  return { picked: picked.slice(0, max), dropped };
}
