/**
 * lib/radar/fit.ts — how worth a founder's time something is right now.
 * Deterministic and explainable: every point has a reason shown to the founder,
 * and anything uncertain becomes a caution, never a silent penalty.
 */
import { tokenize, stem } from "@/lib/taxonomy/taskTaxonomy";
import type { RadarItem, RadarKind, PersonRole } from "@/lib/radar/types";

export type StageBand = "idea" | "validation" | "building" | "launch" | "growth";
export function stageBandOf(stage: string): StageBand {
  const s = (stage || "").toLowerCase();
  if (/idea|concept|explor/.test(s)) return "idea";
  if (/valid|discover|problem/.test(s)) return "validation";
  if (/build|mvp|prototype|develop/.test(s)) return "building";
  if (/launch|beta|early/.test(s)) return "launch";
  if (/grow|revenue|scale|traction|paying/.test(s)) return "growth";
  return "validation";
}

// 0..30: how useful this kind of thing is at this stage.
const KIND_STAGE: Record<RadarKind, Record<StageBand, number>> = {
  meetup:      { idea: 26, validation: 28, building: 12, launch: 20, growth: 14 },
  workshop:    { idea: 22, validation: 20, building: 22, launch: 14, growth: 12 },
  webinar:     { idea: 18, validation: 16, building: 14, launch: 10, growth: 10 },
  hackathon:   { idea: 16, validation: 14, building: 26, launch: 14, growth: 6 },
  conference:  { idea: 10, validation: 14, building: 10, launch: 22, growth: 24 },
  competition: { idea: 12, validation: 16, building: 18, launch: 26, growth: 16 },
  grant:       { idea: 8, validation: 14, building: 18, launch: 22, growth: 26 },
  accelerator: { idea: 14, validation: 24, building: 26, launch: 24, growth: 12 },
  meeting:     { idea: 30, validation: 30, building: 24, launch: 26, growth: 24 },
  person:      { idea: 26, validation: 28, building: 20, launch: 24, growth: 24 },
};
const ROLE_STAGE: Record<PersonRole, Record<StageBand, number>> = {
  customer:     { idea: 30, validation: 30, building: 14, launch: 26, growth: 20 },
  mentor:       { idea: 24, validation: 24, building: 22, launch: 22, growth: 22 },
  investor:     { idea: 4, validation: 8, building: 12, launch: 22, growth: 28 },
  cofounder:    { idea: 22, validation: 20, building: 28, launch: 10, growth: 6 },
  collaborator: { idea: 14, validation: 16, building: 20, launch: 18, growth: 18 },
  other:        { idea: 10, validation: 10, building: 10, launch: 10, growth: 10 },
};

export interface FitContext {
  stage: string;
  projectText: string;       // name + description + problem + target users
  homeWhere?: string;        // "Ghana", "Accra"… as the founder typed it
  now?: number;
}
export interface Fit { score: number; band: "act" | "consider" | "skip"; reasons: string[]; cautions: string[]; }

const DAY = 86_400_000;
const stems = (t: string) => new Set(tokenize(t).map(stem).filter((w) => w.length > 3));

export function daysUntil(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.ceil((t - now) / DAY);
}

/** The date this item is acted on: a deadline for programs, a start for events and meetings. */
export function actionDate(i: Pick<RadarItem, "type" | "deadline_at" | "starts_at" | "next_follow_up_at">): string | null {
  if (i.type === "program") return i.deadline_at ?? i.starts_at;
  if (i.type === "person") return i.next_follow_up_at;
  return i.starts_at ?? i.deadline_at;
}

export function fitFor(i: RadarItem, ctx: FitContext): Fit {
  const now = ctx.now ?? Date.now();
  const band = stageBandOf(ctx.stage);
  const reasons: string[] = [];
  const cautions: string[] = [];
  let score = 0;

  // 1. Stage fit (0-30)
  const base = i.type === "person" && i.role ? ROLE_STAGE[i.role][band] : KIND_STAGE[i.kind][band];
  score += base;
  if (base >= 22) reasons.push(`Useful at your stage (${band}).`);
  else if (base <= 10) cautions.push(`Usually less useful at the ${band} stage.`);

  // 2. Topic overlap with the founder's own project (0-30)
  const mine = stems(ctx.projectText);
  const theirs = stems([i.title, i.organizer ?? "", i.notes ?? "", i.eligibility ?? ""].join(" "));
  let shared = 0; theirs.forEach((w) => { if (mine.has(w)) shared++; });
  const topic = Math.min(30, shared * 10);
  score += topic;
  if (topic >= 20) reasons.push("Matches what you are building.");
  else if (topic === 0 && mine.size) cautions.push("Nothing in it mentions your product or users. Check it is worth the time.");

  // 3. Timing (-100..+25)
  const when = actionDate(i);
  const d = daysUntil(when, now);
  if (i.status === "dismissed" || i.status === "done") score = 0;
  else if (d !== null && d < 0 && i.type !== "person") { score = 0; cautions.push("This has passed."); }
  else if (d !== null) {
    if (d <= 3) { score += 25; reasons.push(d <= 0 ? "Due today." : `Due in ${d} day${d === 1 ? "" : "s"}.`); }
    else if (d <= 14) { score += 15; reasons.push(`In ${d} days.`); }
    else if (d <= 45) score += 6;
    else score += 0;
  } else cautions.push("No date found. Confirm one before planning around it.");

  // 4. Effort, place, cost (-15..+10)
  if (i.is_virtual || i.meeting_url) { score += 10; reasons.push("Online, no travel."); }
  else if (i.location) {
    const home = (ctx.homeWhere ?? "").trim().toLowerCase();
    if (home && i.location.toLowerCase().includes(home)) { score += 8; reasons.push(`In ${i.location}.`); }
    else if (home) { score -= 12; cautions.push(`In ${i.location}. Check you can get there.`); }
    else cautions.push(`In ${i.location}. Tell BuildMind where you are to rank by distance.`);
  }
  if (i.cost && /\b(?:fee|ticket|\$|€|£|paid|registration)\b/i.test(i.cost)) { score -= 5; cautions.push(`May cost money: "${i.cost.slice(0, 60)}".`); }
  if (i.eligibility && /\b(?:only|must be|citizens?|residents?|students|under \d+|based in)\b/i.test(i.eligibility)) cautions.push(`Check eligibility: "${i.eligibility.slice(0, 90)}".`);

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, band: score >= 70 ? "act" : score >= 45 ? "consider" : "skip", reasons: reasons.slice(0, 4), cautions: cautions.slice(0, 3) };
}
