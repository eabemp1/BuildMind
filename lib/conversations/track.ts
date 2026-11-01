/**
 * lib/conversations/track.ts — the tracker behind "Get 5 customer conversations". Pure.
 * The founder enters people and moves them along; BuildMind only counts and suggests the next step.
 */
export type PersonStatus = "to_contact" | "sent" | "replied" | "booked" | "done" | "no_reply";

export const STATUS_LABEL: Record<PersonStatus, string> = {
  to_contact: "Not contacted yet", sent: "Message sent", replied: "Replied", booked: "Call booked", done: "Talked", no_reply: "No reply",
};
export const STATUS_ORDER: PersonStatus[] = ["to_contact", "sent", "replied", "booked", "done", "no_reply"];
export const FOLLOW_UP_AFTER_DAYS = 3;
export const GOAL_DEFAULT = 5;

export interface Person { id: string; name: string; status: PersonStatus; contacted_at: string | null }

export function isStatus(s: unknown): s is PersonStatus {
  return typeof s === "string" && (STATUS_ORDER as string[]).includes(s);
}

const days = (from: string, now: Date) => Math.floor((now.getTime() - Date.parse(from)) / 86_400_000);

/** Sent, with no reply, for at least three days. */
export function followUpDue(p: Person, now: Date): boolean {
  return p.status === "sent" && !!p.contacted_at && days(p.contacted_at, now) >= FOLLOW_UP_AFTER_DAYS;
}

export interface Summary {
  total: number; contacted: number; replied: number; talked: number; booked: number; followUps: number; toContact: number;
  /** Whole percent of contacted people who replied, or null until at least 3 were contacted. */
  replyRate: number | null;
  goal: number; remaining: number;
}

export function summarize(people: Person[], now: Date, goal = GOAL_DEFAULT): Summary {
  const contacted = people.filter((p) => p.status !== "to_contact").length;
  const replied = people.filter((p) => ["replied", "booked", "done"].includes(p.status)).length;
  const talked = people.filter((p) => p.status === "done").length;
  return {
    total: people.length, contacted, replied, talked,
    booked: people.filter((p) => p.status === "booked").length,
    followUps: people.filter((p) => followUpDue(p, now)).length,
    toContact: people.filter((p) => p.status === "to_contact").length,
    replyRate: contacted >= 3 ? Math.round((replied / contacted) * 100) : null,
    goal, remaining: Math.max(0, goal - talked),
  };
}

/** The one thing to do next, in plain words. */
export function nextAction(s: Summary): string {
  if (s.total === 0) return "Add the first 3 people you could talk to. Real names, from places where your users already are.";
  if (s.booked > 0) return `You have ${s.booked} call${s.booked > 1 ? "s" : ""} booked. Prepare your questions, then talk.`;
  if (s.followUps > 0) return `${s.followUps} ${s.followUps > 1 ? "people haven't" : "person hasn't"} replied in ${FOLLOW_UP_AFTER_DAYS}+ days. Send a short follow-up.`;
  if (s.replied > 0 && s.talked < s.goal) return "Someone replied. Suggest a time to talk, today if you can.";
  if (s.toContact > 0) return "Send the first message to someone on your list.";
  if (s.talked >= s.goal) return `You reached ${s.goal} conversations. Look at what people said, then decide your next step.`;
  return "Add a few more people. You need about 4 messages for every conversation.";
}

/** Insight lines must quote the founder's own notes. Anything whose quote is not in the notes is dropped. */
export interface Insight { point: string; quote: string }

export function verifyInsights(raw: unknown, notes: string): Insight[] {
  const norm = (t: string) => t.toLowerCase().replace(/[\s’'"“”]+/g, " ").trim();
  const haystack = norm(notes);
  const list = Array.isArray((raw as { insights?: unknown })?.insights) ? (raw as { insights: unknown[] }).insights : [];
  const out: Insight[] = [];
  for (const x of list.slice(0, 6)) {
    const o = (x ?? {}) as Record<string, unknown>;
    const point = typeof o.point === "string" ? o.point.trim().slice(0, 200) : "";
    const quote = typeof o.quote === "string" ? o.quote.trim().slice(0, 300) : "";
    if (point && quote.length >= 6 && haystack.includes(norm(quote))) out.push({ point, quote });
  }
  return out;
}

export function sanitizeLine(t: unknown, max: number): string {
  return typeof t === "string" ? t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max) : "";
}
