/**
 * lib/companion/policy.ts — how often the Co-founder speaks, by style and intensity.
 *
 * Style and intensity change frequency and framing, never the facts. The daily
 * cap is a hard limit: the Co-founder must not become noise.
 */
import type { Moment, Style } from "@/lib/companion/moments";

export type Intensity = "quiet" | "balanced" | "relentless";

export const STYLE_POLICY: Record<Style, { label: string; tagline: string; color: string; cap: number; floor: number; wins: boolean }> = {
  "direct-challenger": { label: "Challenger", tagline: "Blunt. Calls out the gap.", color: "#ef4444", cap: 3, floor: 35, wins: false },
  "strategic-partner": { label: "Strategist", tagline: "Connects dots. Fewer, sharper nudges.", color: "#6b7280", cap: 2, floor: 40, wins: true },
  "execution-coach": { label: "Coach", tagline: "Practical. Shrinks the next step.", color: "#22c55e", cap: 3, floor: 30, wins: true },
  "devil-advocate": { label: "Skeptic", tagline: "Questions the plan. Asks you to defend it.", color: "#f59e0b", cap: 2, floor: 40, wins: false },
};

export const INTENSITY_LABEL: Record<Intensity, string> = { quiet: "Quiet", balanced: "Balanced", relentless: "Relentless" };

export function limitsFor(style: Style, intensity: Intensity): { cap: number; floor: number } {
  const p = STYLE_POLICY[style];
  if (intensity === "quiet") return { cap: 1, floor: p.floor + 20 };
  if (intensity === "relentless") return { cap: p.cap + 1, floor: Math.max(10, p.floor - 10) };
  return { cap: p.cap, floor: p.floor };
}

export interface EventRow { key: string; status: "shown" | "dismissed" | "acted"; day: string; created_at: string /* when the row was last updated */ }

const DAY = 86_400_000;
const DISMISS_COOLDOWN_DAYS = 3;
const ACTED_COOLDOWN_DAYS = 2;

/**
 * Pick today's moments. Already-shown-today moments stay (so the brief is
 * stable all day); new ones fill remaining slots by severity.
 */
export function selectMoments(
  candidates: Moment[],
  history: EventRow[],
  style: Style,
  intensity: Intensity,
  now = Date.now(),
): { selected: Moment[]; newKeys: string[]; cap: number } {
  const { cap, floor } = limitsFor(style, intensity);
  const today = new Date(now).toISOString().slice(0, 10);
  const wins = STYLE_POLICY[style].wins;

  const lastStatus = new Map<string, EventRow>();
  for (const e of history) {
    const prev = lastStatus.get(e.key);
    if (!prev || Date.parse(e.created_at) > Date.parse(prev.created_at)) lastStatus.set(e.key, e);
  }
  // One row per key per day, status updated in place (shown -> dismissed | acted).
  const todayRows = history.filter((e) => e.day === today);
  const shownToday = new Set(todayRows.filter((e) => e.status === "shown").map((e) => e.key));
  const usedToday = new Set(todayRows.map((e) => e.key));

  const eligible = candidates.filter((m) => {
    if (m.kind === "win" && !wins) return false;
    const last = lastStatus.get(m.key);
    if (last?.status === "dismissed" && now - Date.parse(last.created_at) < DISMISS_COOLDOWN_DAYS * DAY) return false;
    if (last?.status === "acted" && now - Date.parse(last.created_at) < ACTED_COOLDOWN_DAYS * DAY) return false;
    return true;
  });

  const byKey = new Map(eligible.map((m) => [m.key, m]));
  const sticky = [...shownToday].map((k) => byKey.get(k)).filter((m): m is Moment => Boolean(m));
  const slots = Math.max(0, cap - usedToday.size);
  const fresh = eligible
    .filter((m) => !usedToday.has(m.key) && m.severity >= floor)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, slots);

  const selected = [...sticky, ...fresh].sort((a, b) => b.severity - a.severity);
  return { selected, newKeys: fresh.map((m) => m.key), cap };
}
