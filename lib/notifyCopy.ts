/**
 * lib/notifyCopy.ts — the wording of in-app notifications. Pure.
 * Rule: every line carries a fact, a date or a person, and nothing else. No filler, no "AI".
 */
export interface RadarAdded { title: string; deadline_at?: string | null }

const DAY = 86_400_000;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function closesIn(iso: string | null | undefined, now: number): number | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  const d = Math.ceil((t - now) / DAY);
  return d >= 0 ? d : null;
}

/** Leads with the soonest closing date when there is one, otherwise with the best match. */
export function radarFoundMessage(added: RadarAdded[], now = Date.now()): string {
  if (!added.length) return "";
  const dated = added.map((a) => ({ a, d: closesIn(a.deadline_at, now) })).filter((x) => x.d !== null).sort((x, y) => (x.d as number) - (y.d as number));
  const lead = dated[0]?.a ?? added[0];
  const days = dated[0]?.d;
  const rest = added.length - 1;
  const head = days === undefined || days === null ? `Radar: ${clip(lead.title, 90)}` : `Radar: ${clip(lead.title, 90)} ${days === 0 ? "closes today" : days === 1 ? "closes tomorrow" : `closes in ${days} days`}`;
  return rest > 0 ? `${head}. ${rest} more ${rest === 1 ? "opening fits" : "openings fit"} you.` : `${head}.`;
}

/** Says what changed, not how many things changed. */
export function marketWatchMessage(changes: Array<{ text: string }>): string {
  if (!changes.length) return "";
  const rest = changes.length - 1;
  return clip(`Market Watch: ${changes[0].text}${rest > 0 ? ` (+${rest} more this week)` : ""}`, 400);
}

/** The Friday recap in the app. Counts only; says nothing when there is nothing to count. */
export function weeklyRecapMessage(f: { done: number; replies: number; waiting: number }): string | null {
  const parts: string[] = [];
  if (f.done > 0) parts.push(`${f.done} ${f.done === 1 ? "action" : "actions"} done`);
  if (f.replies > 0) parts.push(`${f.replies} ${f.replies === 1 ? "reply" : "replies"}`);
  if (f.waiting > 0) parts.push(`${f.waiting} ${f.waiting === 1 ? "follow-up" : "follow-ups"} due`);
  return parts.length ? `This week: ${parts.join(", ")}.` : null;
}
