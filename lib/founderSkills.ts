import type { FounderIntelligenceState } from "@/lib/founderIntelligence";

export interface FounderSkill {
  id: string;
  label: string;
  description: string;
  level: number;
  xp: number;
  xp_into_level: number;
  xp_for_next_level: number;
  progress: number;
  attempts: number;
  successes: number;
  failures: number;
  trend: "up" | "down" | "steady" | "new";
  summary: string;
}

const SKILL_META: Record<string, { label: string; description: string }> = {
  evidence_probe: {
    label: "Customer Evidence",
    description: "Actions that get direct evidence from users through outreach, interviews, or assumption tests.",
  },
  unstall_goal: {
    label: "Goal Execution",
    description: "Actions that move a stalled or stated goal back into motion.",
  },
  avoidance_microdose: {
    label: "Facing Resistance",
    description: "Small, real steps into the work you have been avoiding.",
  },
  continue_best_next_task: {
    label: "Steady Execution",
    description: "Consistently continuing the current best next task.",
  },
};

function metaFor(id: string) {
  return SKILL_META[id] ?? {
    label: id.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "),
    description: "A pattern of actions BuildMind is tracking for you.",
  };
}

function levelThreshold(level: number): number {
  let xp = 0;
  for (let current = 1; current < level; current += 1) xp += current + 2;
  return xp;
}

function levelFromXp(xp: number) {
  let level = 1;
  while (xp >= levelThreshold(level + 1)) level += 1;
  const floor = levelThreshold(level);
  const ceiling = levelThreshold(level + 1);
  const xp_into_level = xp - floor;
  const xp_for_next_level = ceiling - floor;
  return {
    level,
    xp_into_level,
    xp_for_next_level,
    progress: xp_for_next_level ? Math.min(1, xp_into_level / xp_for_next_level) : 1,
  };
}

function trendFor(successes: number, failures: number, recentSuccesses: number, recentFailures: number): FounderSkill["trend"] {
  const recentAttempts = recentSuccesses + recentFailures;
  const olderAttempts = successes + failures - recentAttempts;
  if (recentAttempts < 2 || olderAttempts < 2) return "new";
  const recentRate = recentSuccesses / recentAttempts;
  const olderRate = (successes - recentSuccesses) / olderAttempts;
  if (recentRate > olderRate + 0.15) return "up";
  if (recentRate < olderRate - 0.15) return "down";
  return "steady";
}

export function buildFounderSkills(state: FounderIntelligenceState): FounderSkill[] {
  return Object.entries(state.archetype_stats ?? {})
    .map(([id, stat]) => {
      const meta = metaFor(id);
      const level = levelFromXp(stat.successes);
      const trend = trendFor(stat.successes, stat.failures, stat.recent_successes, stat.recent_failures);
      return {
        id,
        ...meta,
        ...level,
        xp: stat.successes,
        attempts: stat.successes + stat.failures,
        successes: stat.successes,
        failures: stat.failures,
        trend,
        summary: `${meta.label}: ${stat.successes} completed action${stat.successes === 1 ? "" : "s"}, ${trend === "up" ? "trending up" : trend === "down" ? "trending down" : trend === "steady" ? "holding steady" : "just getting started"}.`,
      };
    })
    .sort((a, b) => b.xp - a.xp || b.attempts - a.attempts);
}
