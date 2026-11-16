/**
 * lib/experimentPlan.ts: the rolling 30-day direction for one experiment. Pure.
 * The goal is the experiment's own goal. The milestones are fixed steps up the evidence ladder and are ticked only by
 * what the founder confirmed. Only the next few actions are spelled out, and they change when a result comes in.
 * A quiet stretch is a valid state: nothing is invented to fill it.
 */
import { tally, nextMove, effectiveEvents, type Experiment, type ExperimentEvent } from "@/lib/experiments";

export const WINDOW_DAYS = 30;
export interface Milestone { id: string; label: string; done: boolean; at: string | null }
export interface RollingPlan {
  day: number; daysLeft: number; windowOver: boolean;
  milestones: Milestone[];
  next: string[];
  quiet: { days: number; note: string } | null;
  summary: string;
}

const DAY = 86_400_000;
const days = (from: string, now: number) => Math.max(0, Math.floor((now - Date.parse(from)) / DAY));

/** The time the Nth distinct person reached a state (any of `kinds`). */
function nthAt(events: ExperimentEvent[], kinds: string[], n: number): string | null {
  const first = new Map<string, string>();
  for (const e of effectiveEvents(events).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (e.who && kinds.includes(e.kind) && !first.has(e.who.toLowerCase())) first.set(e.who.toLowerCase(), e.created_at);
  }
  const at = [...first.values()];
  return at.length >= n ? at[n - 1] : null;
}

export function rollingPlan(exp: Experiment, now: number = Date.now()): RollingPlan {
  const evs = exp.events ?? [];
  const t = tally(evs);
  const day = Math.min(WINDOW_DAYS, days(exp.created_at, now) + 1);
  const touched = ["sent", "replied", "no_reply", "conversation", "declined", "pilot_agreed", "would_pay", "paid", "delivered"];
  const milestones: Milestone[] = [
    { id: "ask5", label: "Ask five people", at: nthAt(evs, touched, 5), done: false },
    { id: "reply1", label: "Get a first reply", at: nthAt(evs, ["replied", "conversation", "pilot_agreed", "would_pay", "paid", "delivered"], 1), done: false },
    { id: "talk3", label: "Talk with three people who replied", at: nthAt(evs, ["replied", "conversation", "pilot_agreed", "would_pay", "paid", "delivered"], 3), done: false },
    { id: "willing", label: "Someone says they would pay", at: nthAt(evs, ["would_pay", "paid"], 1), done: false },
    { id: "paid", label: "Someone pays for a small pilot", at: nthAt(evs, ["paid"], 1), done: false },
  ].map((m) => ({ ...m, done: m.at !== null }));

  const move = nextMove(t);
  const undone = milestones.filter((m) => !m.done);
  const next: string[] = [move.headline];
  const after: Record<string, string> = {
    ask5: "Pick the next people to ask from places you can see them: public pages, shops you can visit, groups you already belong to.",
    reply1: "Change one thing in your message, such as the opening line, and send it to five people you have not asked.",
    talk3: "Ask each person who replied what they do today about this problem and what it costs them.",
    willing: "Ask the people you talked to whether they would pay, and what they would pay for first.",
    paid: "Offer one person a small paid pilot with a price and a date.",
  };
  for (const m of undone) { const a = after[m.id]; if (a && !next.includes(a)) next.push(a); if (next.length >= 3) break; }

  const last = evs.map((e) => e.created_at).sort().pop() ?? exp.created_at;
  const quietDays = days(last, now);
  const quiet = exp.status === "running" && quietDays >= 7
    ? { days: quietDays, note: `Nothing recorded for ${quietDays} days. That is fine. If you did something, record it. If not, the smallest step is to send one message today.` }
    : null;

  const windowOver = days(exp.created_at, now) >= WINDOW_DAYS;
  const doneCount = milestones.filter((m) => m.done).length;
  const summary = windowOver
    ? `Day ${WINDOW_DAYS} is over. ${doneCount} of ${milestones.length} milestones reached. Make a decision: keep going, change something, or stop.`
    : `Day ${day} of ${WINDOW_DAYS}. ${doneCount} of ${milestones.length} milestones reached.`;
  return { day, daysLeft: Math.max(0, WINDOW_DAYS - day), windowOver, milestones, next: next.slice(0, 3), quiet, summary };
}
