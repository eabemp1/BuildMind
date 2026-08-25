/**
 * lib/founderSkills.ts — Founder Skills (use-based leveling)
 *
 * The FI OS (lib/founderIntelligence.ts) already tracks, per decision
 * archetype (evidence_probe / unstall_goal / avoidance_microdose /
 * continue_best_next_task), how many times a recommendation of that type
 * led to real completed evidence for THIS founder. Until now that data was
 * used exclusively to rank which archetype to recommend next (Thompson
 * Sampling in scoreCandidate()) — it was never shown to the founder.
 *
 * This module is a pure, deterministic re-presentation of that same data as
 * a founder-facing "skill": a level that goes up only when the founder
 * actually completes real work of that type (not a login streak, not time
 * elapsed). No new data is collected and no new columns are written — this
 * is a read-only view over lib/founderIntelligence.ts's archetype_stats.
 *
 * Deliberately excludes the extraction mechanics named in the original
 * eFootball comparison (pack-odds RNG rewards, FOMO-timed events) — only
 * the "you get better at what you actually do" mechanic is ported over.
 *
 * SERVER-SIDE (pure function, safe to call anywhere with a FounderIntelligenceState).
 */

import type { FounderIntelligenceState } from "@/lib/founderIntelligence";

export interface FounderSkill {
  id: string;
  label: string;
  description: string;
  level: number;
  xp: number;
  xp_into_level: number;
  xp_for_next_level: number;
  progress: number; // 0-1, progress toward next level
  attempts: number;
  successes: number;
  failures: number;
  trend: "up" | "down" | "steady" | "new";
  summary: string;
}

const SKILL_META: Record<string, { label: string; description: string }> = {
  evidence_probe: {
    label: "Customer Evidence",
    description: "Actions that get real evidence from users — outreach, interviews, testing an assumption directly.",
  },
  unstall_goal: {
    label: "Goal Execution",
    description: "Actions that push a stalled or stated goal back into motion.",
  },
  avoidance_microdose: {
    label: "Facing Resistance",
    description: "Small, real steps into the specific work you've been avoiding.",
  },
  continue_best_next_task: {
    label: "Steady Execution",
    description: "Keeping momentum on your current best next task, consistently.",
  },
};

function titleize(id: string): string {
  return id
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function metaFor(id: string): { label: string; description: string } {
  return SKILL_META[id] ?? { label: titleize(id), description: "A pattern of actions BuildMind is tracking for you." };
}

/**
 * Level thresholds grow by an increasing gap (3, 4, 5, 6...) rather than a
 * flat XP-per-level curve, so early levels are fast (early wins feel good)
 * and later levels take sustained real work — mirrors how a used card
 * levels up quickly at first, then plateaus without continued play.
 */
function levelThreshold(level: number): number {
  if (level <= 1) return 0;
  let xp = 0;
  for (let l = 1; l < level; l++) xp += l + 2;
  return xp;
}

function levelFromXp(xp: number): { level: number; xp_into_level: number; xp_for_next_level: number; progress: number } {
  let level = 1;
  while (xp >= levelThreshold(level + 1)) level++;
  const floor = levelThreshold(level);
  const ceil = levelThreshold(level + 1);
  const xp_into_level = xp - floor;
  const xp_for_next_level = ceil - floor;
  const progress = xp_for_next_level > 0 ? Math.min(1, xp_into_level / xp_for_next_level) : 1;
  return { level, xp_into_level, xp_for_next_level, progress };
}

function computeTrend(successes: number, failures: number, recentSuccesses: number, recentFailures: number): FounderSkill["trend"] {
  const recentAttempts = recentSuccesses + recentFailures;
  if (recentAttempts < 2) return "new";

  const olderSuccesses = successes - recentSuccesses;
  const olderFailures = failures - recentFailures;
  const olderAttempts = olderSuccesses + olderFailures;
  if (olderAttempts < 2) return "new";

  const recentRate = recentSuccesses / recentAttempts;
  const olderRate = olderSuccesses / olderAttempts;
  if (recentRate > olderRate + 0.15) return "up";
  if (recentRate < olderRate - 0.15) return "down";
  return "steady";
}

function summarize(label: string, successes: number, trend: FounderSkill["trend"]): string {
  const countPhrase = `${successes} ${successes === 1 ? "completed action" : "completed actions"}`;
  const trendPhrase = trend === "up" ? "trending up" : trend === "down" ? "trending down" : trend === "steady" ? "holding steady" : "just getting started";
  return `${label}: ${countPhrase}, ${trendPhrase}`;
}

/**
 * Builds the founder-facing skill list from FounderIntelligenceState.
 * Only includes archetypes with at least one resolved (non-pending)
 * prediction — a skill only appears once it's actually been used, same as
 * the "use it to level it" principle this is modeled on. Sorted by XP
 * (successes) descending so the founder's strongest skill leads.
 */
export function buildFounderSkills(state: FounderIntelligenceState): FounderSkill[] {
  const entries = Object.entries(state.archetype_stats ?? {});
  const skills: FounderSkill[] = entries.map(([id, stat]) => {
    const meta = metaFor(id);
    const xp = stat.successes;
    const { level, xp_into_level, xp_for_next_level, progress } = levelFromXp(xp);
    const trend = computeTrend(stat.successes, stat.failures, stat.recent_successes, stat.recent_failures);
    return {
      id,
      label: meta.label,
      description: meta.description,
      level,
      xp,
      xp_into_level,
      xp_for_next_level,
      progress,
      attempts: stat.successes + stat.failures,
      successes: stat.successes,
      failures: stat.failures,
      trend,
      summary: summarize(meta.label, stat.successes, trend),
    };
  });

  return skills.sort((a, b) => b.xp - a.xp || b.attempts - a.attempts);
}
