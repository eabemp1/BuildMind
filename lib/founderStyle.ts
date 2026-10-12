/**
 * lib/founderStyle.ts
 *
 * Turns what BuildMind already knows about HOW a founder executes into a
 * small, typed profile that the Break My Startup Pivot Engine can use.
 *
 * Why this exists: pivots used to be generated from the idea and the market
 * signals only. Two founders with the same idea got the same pivots, even if
 * one ships daily and the other has avoided customer conversations for three
 * weeks. A pivot a founder will never execute has no value, and a pivot that
 * fits how they work is more likely to produce a win that builds confidence.
 *
 * Pure builder (`buildFounderStyleProfile`) plus a best-effort loader. The
 * loader never throws: a founder with no history gets `hasSignal: false` and
 * the pivot prompt falls back to idea-only reasoning.
 */

import type { FounderArchetype } from "@/lib/founderArchetype";
import { ARCHETYPE_WATCH } from "@/lib/founderArchetype";

export type ExecutionPace = "fast" | "steady" | "slow" | "stalled" | "unknown";

export interface FounderStyleProfile {
  /** True when there is at least one real behavioural signal to personalise on. */
  hasSignal: boolean;
  archetype: FounderArchetype | null;
  /** Plain-language label for the UI, e.g. "Builds fast, avoids customers". */
  styleLabel: string;
  pace: ExecutionPace;
  momentum: number | null;
  cognitiveLoad: "fresh" | "drained" | "autopilot" | null;
  strengths: string[];
  avoids: string[];
  /** Task categories they complete most often. */
  strongCategories: string[];
  repeatedPostponements: number;
  daysInactive: number | null;
}

const ARCHETYPES: FounderArchetype[] = [
  "technical-overbuilder", "vision-heavy-executor", "validation-avoider", "chaotic-high-energy", "methodical-slow-mover",
];

const ARCHETYPE_LABEL: Record<FounderArchetype, string> = {
  "technical-overbuilder": "Builds well, talks to customers late",
  "vision-heavy-executor": "Big vision, needs a short runway of wins",
  "validation-avoider": "Strong on ideas, avoids customer conversations",
  "chaotic-high-energy": "High energy, many threads at once",
  "methodical-slow-mover": "Careful and thorough, slow to ship",
};

function archetypeFromTags(tags: unknown): FounderArchetype | null {
  if (!Array.isArray(tags)) return null;
  for (const t of tags) {
    if (typeof t !== "string" || !t.startsWith("archetype:")) continue;
    const key = t.slice("archetype:".length) as FounderArchetype;
    if (ARCHETYPES.includes(key)) return key;
  }
  return null;
}

function strList(v: unknown, max: number): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, max) : [];
}

export interface FounderStyleInput {
  memory?: { personality_tags?: unknown; strengths?: unknown; avoidance_zones?: unknown } | null;
  context?: {
    momentum_score?: number | null;
    cognitive_load?: string | null;
    avoidance_zones?: unknown;
    days_inactive?: number | null;
    consecutive_tasks_completed?: number | null;
  } | null;
  execution?: {
    task_velocity_7d?: number | null;
    stall_days?: number | null;
    repeated_postponements?: number;
    focus_distribution?: Array<{ category: string; count: number }>;
  } | null;
}

export function buildFounderStyleProfile(input: FounderStyleInput): FounderStyleProfile {
  const { memory, context, execution } = input;
  const archetype = archetypeFromTags(memory?.personality_tags);
  const momentum = typeof context?.momentum_score === "number" ? Math.round(context.momentum_score) : null;
  const load = context?.cognitive_load === "fresh" || context?.cognitive_load === "drained" || context?.cognitive_load === "autopilot"
    ? context.cognitive_load : null;
  const daysInactive = typeof context?.days_inactive === "number" ? context.days_inactive : null;
  const stall = execution?.stall_days ?? null;
  const velocity = execution?.task_velocity_7d ?? null;
  const postponements = execution?.repeated_postponements ?? 0;

  let pace: ExecutionPace = "unknown";
  if ((daysInactive ?? 0) >= 7 || (stall ?? 0) >= 10) pace = "stalled";
  else if (velocity !== null) pace = velocity >= 5 ? "fast" : velocity >= 2 ? "steady" : "slow";
  else if (momentum !== null) pace = momentum >= 70 ? "fast" : momentum >= 45 ? "steady" : "slow";

  const avoids = [...new Set([...strList(context?.avoidance_zones, 4), ...strList(memory?.avoidance_zones, 4)])].slice(0, 4);
  const strengths = strList(memory?.strengths, 4);
  const strongCategories = (execution?.focus_distribution ?? [])
    .filter((f) => f.category && f.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((f) => f.category);

  const hasSignal = Boolean(archetype) || avoids.length > 0 || strengths.length > 0 || strongCategories.length > 0 || pace !== "unknown";

  let styleLabel = archetype ? ARCHETYPE_LABEL[archetype] : "";
  if (!styleLabel) {
    if (pace === "stalled") styleLabel = "Currently stalled, needs a small win to restart";
    else if (strongCategories.length) styleLabel = `Most consistent on ${strongCategories[0].toLowerCase()} work`;
    else if (pace !== "unknown") styleLabel = pace === "fast" ? "Ships quickly" : pace === "steady" ? "Steady, consistent pace" : "Slow and deliberate pace";
    else styleLabel = "Not enough history yet";
  }

  return { hasSignal, archetype, styleLabel, pace, momentum, cognitiveLoad: load, strengths, avoids, strongCategories, repeatedPostponements: postponements, daysInactive };
}

/** Prompt block for the Pivot Engine. Empty string when there is no signal. */
export function buildFounderStylePromptBlock(p: FounderStyleProfile | undefined | null): string {
  if (!p || !p.hasSignal) return "";
  const lines: string[] = ["FOUNDER EXECUTION STYLE (observed behaviour, not self-description):"];
  lines.push(`- Style: ${p.styleLabel}`);
  if (p.archetype) lines.push(`- Watch out for: ${ARCHETYPE_WATCH[p.archetype]}`);
  if (p.pace !== "unknown") lines.push(`- Current pace: ${p.pace}${p.momentum !== null ? ` (momentum ${p.momentum}/100)` : ""}`);
  if (p.strongCategories.length) lines.push(`- Completes most reliably: ${p.strongCategories.join(", ")}`);
  if (p.strengths.length) lines.push(`- Strengths: ${p.strengths.join(", ")}`);
  if (p.avoids.length) lines.push(`- Tends to avoid: ${p.avoids.join(", ")}`);
  if (p.repeatedPostponements >= 2) lines.push(`- Has postponed the same work ${p.repeatedPostponements} times`);
  if (p.cognitiveLoad && p.cognitiveLoad !== "fresh") lines.push(`- Energy right now: ${p.cognitiveLoad}`);
  lines.push(
    "PERSONALISATION RULES:",
    "- Favour pivots whose FIRST STEP uses what this founder already does reliably, so the first week ends in a visible win.",
    "- At most one pivot may require the work they avoid, and if so it must start with the smallest possible version of it.",
    "- If pace is stalled or slow, make first steps small (under 3 hours). If pace is fast, allow a more ambitious first step.",
    "- Never flatter. Fit is about what they are likely to finish, not what they would enjoy.",
  );
  return lines.join("\n");
}

type SupabaseLike = { from: (t: string) => any };

/** Best-effort loader. Never throws. */
export async function loadFounderStyleProfile(
  supabase: SupabaseLike,
  userId: string,
  execution?: FounderStyleInput["execution"],
): Promise<FounderStyleProfile> {
  try {
    const [mem, ctx] = await Promise.allSettled([
      supabase.from("founder_memory").select("personality_tags,strengths,avoidance_zones").eq("user_id", userId).maybeSingle(),
      supabase.from("founder_context").select("momentum_score,cognitive_load,avoidance_zones,days_inactive,consecutive_tasks_completed").eq("user_id", userId).maybeSingle(),
    ]);
    return buildFounderStyleProfile({
      memory: mem.status === "fulfilled" ? mem.value?.data : null,
      context: ctx.status === "fulfilled" ? ctx.value?.data : null,
      execution,
    });
  } catch {
    return buildFounderStyleProfile({});
  }
}
