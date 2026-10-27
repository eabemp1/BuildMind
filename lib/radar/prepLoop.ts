/** When the founder commits to an event, Today should remind them to prepare before it, not on the morning. */
const DAY = 86_400_000;
export const PREP_LEAD_DAYS = 2;

export function prepLoopFor(item: { type: string; title: string; starts_at: string | null }, now = Date.now()): { task_text: string; measure: string; due_at: string } | null {
  if (item.type !== "event" || !item.starts_at) return null;
  const start = Date.parse(item.starts_at);
  if (Number.isNaN(start)) return null;
  const due = start - PREP_LEAD_DAYS * DAY;
  if (due <= now) return null; // too close: the takeover and "soon" banner already cover it
  return { task_text: `Prepare for ${item.title}`.slice(0, 200), measure: "Do you know who to meet and what to ask?", due_at: new Date(due).toISOString() };
}
