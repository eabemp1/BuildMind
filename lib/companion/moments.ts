/**
 * lib/companion/moments.ts — what the Co-founder has to say, and why.
 *
 * Every moment is built by plain code from the founder's own records, never by
 * a model: the facts (counts, dates, titles) are identical whatever style the
 * founder picked. Style (lib/companion/policy.ts) only changes how often the
 * Co-founder speaks and how it frames the same facts.
 *
 * A moment may carry one small job. Jobs never run on their own: the founder
 * approves (or edits) them in the card.
 */
import { zoneMatchesActions, type CompletedAction } from "@/lib/avoidanceMatch";
import { inferActionType } from "@/lib/actionClassification";
import type { DurationChoice } from "@/lib/today/loops";

export type Style = "direct-challenger" | "strategic-partner" | "execution-coach" | "devil-advocate";

export type MomentKind =
  | "pushback_planned_vs_done"
  | "pushback_avoidance"
  | "reflection_gap"
  | "milestone_overdue"
  | "restart"
  | "win";

export type Job =
  | { type: "schedule_followup"; task: string; measure: string; choice: DurationChoice }
  | { type: "open"; href: string; label: string };

export interface Moment {
  /** Stable per kind + subject, so cooldowns and "already shown today" work. */
  key: string;
  kind: MomentKind;
  severity: number; // 0-100
  subject: string;
  /** Neutral evidence lines, shown to the founder as-is. Never restyled. */
  facts: string[];
  job?: Job;
}

export interface ShapedMoment extends Moment {
  headline: string;
  body: string;
}

export interface TaskRow {
  action_shown: string | null;
  action_type?: string | null;
  outcome: string | null;
  created_at: string;
}

export interface CompanionInput {
  now: number;
  snapshot: {
    streak: number;
    completedToday: boolean;
    daysInactive: number | null;
    worstOverdue: { title: string; daysLate: number } | null;
  } | null;
  avoidanceZones: string[];
  /** Today-flow task rows from the last 21 days. */
  tasks: TaskRow[];
  /** Titles completed today. */
  completedTodayTitles: string[];
  reflectionsToday: number;
}

const DAY = 86_400_000;
const WIN_STREAKS = new Set([3, 7, 14, 30, 60, 100]);
const DONE = new Set(["completed", "partial"]);
const NOT_DONE = new Set(["ignored", "overridden", "skipped"]);

const typeLabel = (t: string) => t.replace(/_/g, " ");
const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Planned-vs-done by kind of work. Needs at least 4 resolved tasks and a completion rate of 34% or less. */
export function plannedVsDone(input: CompanionInput): Moment[] {
  const since = input.now - 21 * DAY;
  const by = new Map<string, { done: number; missed: number; lastMissed: string }>();
  for (const t of input.tasks) {
    if (!t.action_shown || Date.parse(t.created_at) < since) continue;
    const resolved = t.outcome && (DONE.has(t.outcome) || NOT_DONE.has(t.outcome));
    if (!resolved) continue;
    const type = (t.action_type || inferActionType(t.action_shown)) as string;
    const row = by.get(type) ?? { done: 0, missed: 0, lastMissed: "" };
    if (DONE.has(t.outcome!)) row.done++; else { row.missed++; row.lastMissed ||= t.action_shown; }
    by.set(type, row);
  }
  const out: Moment[] = [];
  for (const [type, r] of by) {
    const n = r.done + r.missed;
    const rate = r.done / n;
    if (n < 4 || rate > 0.34) continue;
    const pct = Math.round(rate * 100);
    out.push({
      key: `pvd:${type}`,
      kind: "pushback_planned_vs_done",
      severity: Math.round(55 + (1 - rate) * 30),
      subject: typeLabel(type),
      facts: [
        `${typeLabel(type)}: ${n} tasks resolved in 21 days, ${r.done} done (${pct}%).`,
        ...(r.lastMissed ? [`Most recent one you didn't do: "${clip(r.lastMissed)}".`] : []),
      ],
      job: { type: "open", href: "/reflect", label: "Tell me what's in the way" },
    });
  }
  return out.sort((a, b) => b.severity - a.severity).slice(0, 1);
}

/** An avoided area with no matching completed task for 10 days. */
export function avoidance(input: CompanionInput): Moment[] {
  const recent: CompletedAction[] = input.tasks
    .filter((t) => t.action_shown && t.outcome === "completed" && Date.parse(t.created_at) >= input.now - 10 * DAY)
    .map((t) => ({ title: t.action_shown as string, actionType: t.action_type ?? null }));
  const missed = input.tasks.filter((t) => t.action_shown && t.outcome && NOT_DONE.has(t.outcome));
  for (const zone of input.avoidanceZones) {
    if (!zone || zoneMatchesActions(zone, recent)) continue;
    const skipped = missed.filter((t) => zoneMatchesActions(zone, [{ title: t.action_shown as string, actionType: t.action_type ?? null }])).length;
    return [{
      key: `avoid:${zone.toLowerCase()}`,
      kind: "pushback_avoidance",
      severity: 62 + Math.min(15, skipped * 5),
      subject: zone,
      facts: [
        `"${zone}" is on your avoided list.`,
        "No matching task completed in the last 10 days.",
        ...(skipped ? [`${skipped} matching task${skipped === 1 ? "" : "s"} skipped or ignored in 21 days.`] : []),
      ],
      job: { type: "schedule_followup", task: `One ${zone.toLowerCase()} action, ten minutes`, measure: "what you did and what came back", choice: "1d" },
    }];
  }
  return [];
}

export function reflectionGap(input: CompanionInput): Moment[] {
  const title = input.completedTodayTitles[0];
  if (!title || input.reflectionsToday > 0) return [];
  return [{
    key: "reflect-gap",
    kind: "reflection_gap",
    severity: 46,
    subject: "reflection",
    facts: [`You completed "${clip(title)}" today and haven't recorded what happened.`],
    job: { type: "open", href: `/reflect?tried=${encodeURIComponent(title.slice(0, 200))}`, label: "Record it (prefilled)" },
  }];
}

export function milestoneOverdue(input: CompanionInput): Moment[] {
  const w = input.snapshot?.worstOverdue;
  if (!w || w.daysLate < 1) return [];
  return [{
    key: `milestone:${w.title.toLowerCase().slice(0, 60)}`,
    kind: "milestone_overdue",
    severity: Math.min(80, 50 + w.daysLate * 2),
    subject: w.title,
    facts: [`"${clip(w.title)}" is ${w.daysLate} day${w.daysLate === 1 ? "" : "s"} past its deadline.`],
    job: { type: "open", href: "/projects", label: "Open projects" },
  }];
}

export function restart(input: CompanionInput): Moment[] {
  const d = input.snapshot?.daysInactive;
  if (d == null || d < 3) return [];
  return [{
    key: "restart",
    kind: "restart",
    severity: Math.min(80, 40 + d * 3),
    subject: "inactive",
    facts: [`No completed task for ${d} days.`],
    job: { type: "open", href: "/today", label: "Open today's task" },
  }];
}

export function win(input: CompanionInput): Moment[] {
  const s = input.snapshot;
  if (!s || !s.completedToday || !WIN_STREAKS.has(s.streak)) return [];
  return [{ key: `win:${s.streak}`, kind: "win", severity: 30, subject: `${s.streak}-day streak`, facts: [`${s.streak} days in a row with a completed task.`] }];
}

export function buildMoments(input: CompanionInput): Moment[] {
  return [
    ...plannedVsDone(input), ...avoidance(input), ...reflectionGap(input),
    ...milestoneOverdue(input), ...restart(input), ...win(input),
  ];
}

// ── Voice: same facts, different framing per style ─────────────────────────

type Voice = { headline: (s: string) => string; body: string };
const VOICE: Record<MomentKind, Record<Style, Voice>> = {
  pushback_planned_vs_done: {
    "direct-challenger": { headline: (s) => `You keep planning ${s} and not doing it.`, body: "Either do it this week or drop it. Which one?" },
    "strategic-partner": { headline: (s) => `${cap(s)} is where plan and output diverge.`, body: "Is it the wrong bet, or the right bet in too big a piece?" },
    "execution-coach": { headline: (s) => `${cap(s)} keeps slipping. Let's shrink it.`, body: "Name the smallest version you could finish today." },
    "devil-advocate": { headline: (s) => `Are you sure ${s} is worth your time?`, body: "Your record says you avoid it. Defend keeping it." },
  },
  pushback_avoidance: {
    "direct-challenger": { headline: (s) => `${cap(s)}: you're still dodging it.`, body: "Ten minutes. Approve a check-back and do one real action." },
    "strategic-partner": { headline: (s) => `${cap(s)} is the constraint you keep routing around.`, body: "One small action here unlocks more than another week elsewhere." },
    "execution-coach": { headline: (s) => `Time to take one step on ${s}.`, body: "Ten minutes is enough. I'll check back so it doesn't drift." },
    "devil-advocate": { headline: (s) => `What if ${s} is exactly what you're afraid to learn?`, body: "Do one action and let the result argue with you." },
  },
  reflection_gap: {
    "direct-challenger": { headline: () => "You did the work. Now say what happened.", body: "No reflection, no learning." },
    "strategic-partner": { headline: () => "Capture it while it's fresh.", body: "Tomorrow's task is only as good as today's record." },
    "execution-coach": { headline: () => "Nice work today. Lock it in.", body: "A minute to record it makes tomorrow's task sharper." },
    "devil-advocate": { headline: () => "Did it work, or does it just feel like it did?", body: "Write down what actually happened." },
  },
  milestone_overdue: {
    "direct-challenger": { headline: () => "A deadline you set has passed.", body: "Move it honestly or finish it." },
    "strategic-partner": { headline: () => "A milestone has slipped.", body: "Decide whether the date or the scope was wrong." },
    "execution-coach": { headline: () => "A milestone needs a reset.", body: "Pick the next concrete step and a new date." },
    "devil-advocate": { headline: () => "Was this deadline ever real?", body: "Either commit to it or admit it isn't a priority." },
  },
  restart: {
    "direct-challenger": { headline: () => "You've gone quiet.", body: "One task. Today." },
    "strategic-partner": { headline: () => "Momentum is decaying.", body: "A single completed task restarts the loop." },
    "execution-coach": { headline: () => "Let's get you moving again.", body: "Start with today's task. Small is fine." },
    "devil-advocate": { headline: () => "What changed since you last shipped?", body: "Name it, then do one small thing anyway." },
  },
  win: {
    "direct-challenger": { headline: (s) => `${cap(s)}. Don't get comfortable.`, body: "Raise the bar tomorrow." },
    "strategic-partner": { headline: (s) => `${cap(s)}.`, body: "Consistency is compounding. Keep the next step honest." },
    "execution-coach": { headline: (s) => `${cap(s)}. That's real.`, body: "Keep going." },
    "devil-advocate": { headline: (s) => `${cap(s)}.`, body: "Good. Now check the work behind it is real." },
  },
};

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

export function shape(m: Moment, style: Style): ShapedMoment {
  const v = VOICE[m.kind][style];
  return { ...m, headline: v.headline(m.subject), body: v.body };
}
