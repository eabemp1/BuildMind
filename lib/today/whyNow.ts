/**
 * lib/today/whyNow.ts — the one line under today's task that says why it matters now.
 * Pure. One reason only, picked by priority, and every number is a count of the founder's own records.
 */
export interface WhyNowFacts {
  /** People messaged 3+ days ago with no reply. */
  waiting: number;
  /** People messaged in the last 3 days, and how many of them replied. */
  sentRecent: number;
  repliedRecent: number;
  /** Competitor changes in this week's Market Watch scan (0 when there is no fresh scan). */
  marketChanges: number;
  /** The soonest open milestone with a date, in whole days from today (negative = overdue). Absent when none. */
  milestone?: { title: string; days: number } | null;
}

const s = (n: number) => (n === 1 ? "" : "s");

export function pickWhyNow(f: WhyNowFacts): string | null {
  if (f.waiting > 0) return f.waiting === 1 ? "1 person is waiting on your follow-up." : `${f.waiting} people are waiting on your follow-up.`;
  const m = f.milestone;
  if (m && m.days <= 3 && m.days >= -14) {
    const t = m.title.length > 60 ? `${m.title.slice(0, 59).trimEnd()}…` : m.title;
    return m.days < 0 ? `Your milestone "${t}" was due ${-m.days} day${s(-m.days)} ago.` : m.days === 0 ? `Your milestone "${t}" is due today.` : `Your milestone "${t}" is due in ${m.days} day${s(m.days)}.`;
  }
  if (f.sentRecent > 0 && f.repliedRecent > 0) return `You messaged ${f.sentRecent} ${f.sentRecent === 1 ? "person" : "people"} recently. ${f.repliedRecent} replied.`;
  if (f.marketChanges > 0) return `Market Watch found ${f.marketChanges} change${s(f.marketChanges)} among your competitors this week.`;
  return null;
}
