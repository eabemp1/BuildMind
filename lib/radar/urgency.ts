/**
 * lib/radar/urgency.ts - how much a tracked opportunity should shape TODAY.
 *
 * Deterministic and pure, so the same list on the same day always gives the same answer.
 *   takeover  the item cannot wait: Today's task is replaced by its next move (with an undo)
 *   soon      worth acting on this week: shown prominently above the task, task unchanged
 *   watching  tracked but not due: a quiet status line, so Radar is visibly alive
 */
import type { RadarView } from "@/lib/radar/store";

export type RadarLevel = "takeover" | "soon" | "watching" | "empty";

export interface RadarSignal {
  level: RadarLevel;
  item: RadarView | null;
  /** One line saying why this matters now. */
  headline: string;
  /** What Today's task becomes on takeover. */
  task: string;
  tracked: number;
  dueThisWeek: number;
}

const dayWord = (d: number) => (d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`);

function labelFor(i: RadarView): string {
  if (i.type === "program") return `${i.kind} deadline`;
  if (i.type === "meeting") return "Meeting";
  if (i.type === "person") return `Follow-up with ${i.title}`;
  return i.kind;
}

/** Can this item take over today at all? Confirmed, worth it, and not already handled. */
export function isLive(i: RadarView): boolean {
  if (!i.kind_confirmed) return false;
  if (i.status === "done" || i.status === "dismissed") return false;
  if (i.fit.band === "skip") return false;
  return true;
}

/** Hard urgency: due inside the window where waiting costs the founder the opportunity. */
export function isTakeover(i: RadarView): boolean {
  if (!isLive(i) || i.days === null) return false;
  const d = i.days;
  if (i.type === "program") return i.status !== "applied" && i.fit.band === "act" && d >= 0 && d <= 2;
  if (i.type === "meeting") return d >= 0 && d <= 1;
  if (i.type === "person") return d <= 0 && d >= -30 && i.fit.band !== "skip" && Boolean(i.next_follow_up_at);
  // events: today/tomorrow and a strong fit, and not already handled (attending = RSVP done)
  return d >= 0 && d <= 1 && i.status !== "attending" && i.fit.band === "act";
}

export function isSoon(i: RadarView): boolean {
  if (!isLive(i) || i.days === null) return false;
  return i.fit.band === "act" && i.days >= 0 && i.days <= 7;
}

export function radarSignal(items: RadarView[], ignoredId?: string | null): RadarSignal {
  const live = items.filter(isLive);
  const tracked = items.length;
  const dueThisWeek = live.filter(isSoon).length;
  const by = (a: RadarView, b: RadarView) => (a.days ?? 99) - (b.days ?? 99) || b.fit.score - a.fit.score;

  const take = live.filter((i) => isTakeover(i) && i.id !== ignoredId).sort(by)[0];
  if (take) {
    return { level: "takeover", item: take, tracked, dueThisWeek, task: take.next_move,
      headline: `${labelFor(take)} ${dayWord(Math.max(0, take.days ?? 0))}: ${take.title}` };
  }
  const soon = live.filter((i) => isSoon(i) || (isTakeover(i) && i.id === ignoredId)).sort(by)[0];
  if (soon) {
    return { level: "soon", item: soon, tracked, dueThisWeek, task: soon.next_move,
      headline: `${labelFor(soon)} ${dayWord(Math.max(0, soon.days ?? 0))}: ${soon.title}` };
  }
  if (tracked > 0) {
    const next = live.filter((i) => i.days !== null && (i.days as number) >= 0).sort(by)[0] ?? null;
    return { level: "watching", item: next, tracked, dueThisWeek: 0, task: "",
      headline: next ? `Next: ${next.title} ${dayWord(next.days as number)}` : "Nothing due soon" };
  }
  return { level: "empty", item: null, tracked: 0, dueThisWeek: 0, task: "", headline: "Radar is empty" };
}
