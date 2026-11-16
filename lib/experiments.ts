/**
 * lib/experiments.ts: the Customer Experiment record. Pure and client-safe.
 * One experiment = a goal, a hypothesis, who it is for, and what really happened with each person.
 * Every event is something the founder confirmed. BuildMind never marks anything sent, replied or delivered itself,
 * and "unknown" is a normal state.
 */
export const EVENT_KINDS = ["prepared", "sent", "replied", "no_reply", "blocked", "would_pay", "paid", "note"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const DECISIONS = ["continue", "change_message", "change_audience", "test_other", "stop"] as const;
export type Decision = (typeof DECISIONS)[number];

export interface ExperimentEvent { id?: string; who: string; kind: EventKind; detail: string; created_at: string }
export interface Experiment {
  id: string; goal: string; hypothesis: string; audience: string; plan: string;
  status: "running" | "decided" | "archived"; decision: Decision | null; decision_note: string;
  created_at: string; updated_at: string; events?: ExperimentEvent[];
}

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, n) : "");

export function parseNewExperiment(b: unknown): { ok: true; value: { goal: string; hypothesis: string; audience: string; plan: string } } | { ok: false; error: string } {
  const o = (b ?? {}) as Record<string, unknown>;
  const goal = clip(o.goal, 200);
  if (goal.length < 8) return { ok: false, error: "Say what you want to find out, in a sentence." };
  return { ok: true, value: { goal, hypothesis: clip(o.hypothesis, 300), audience: clip(o.audience, 200), plan: clip(o.plan, 600) } };
}

export function parseEvent(b: unknown): { ok: true; value: { who: string; kind: EventKind; detail: string } } | { ok: false; error: string } {
  const o = (b ?? {}) as Record<string, unknown>;
  const kind = EVENT_KINDS.find((k) => k === o.kind);
  if (!kind) return { ok: false, error: "Pick what happened." };
  const who = clip(o.who, 80);
  if (kind !== "note" && !who) return { ok: false, error: "Say who this was with." };
  return { ok: true, value: { who, kind, detail: clip(o.detail, 400) } };
}

export type ReceiptState = "prepared" | "sent" | "replied" | "no_reply" | "blocked" | "would_pay" | "paid" | "unknown";
export interface Receipt { who: string; state: ReceiptState; detail: string; at: string }

/** One line per person: the latest thing the founder confirmed about them. */
export function receipts(events: ExperimentEvent[]): Receipt[] {
  const by = new Map<string, Receipt>();
  const ordered = [...events].filter((e) => e.kind !== "note" && e.who).sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const e of ordered) by.set(e.who.toLowerCase(), { who: e.who, state: e.kind as ReceiptState, detail: e.detail, at: e.created_at });
  return [...by.values()].sort((a, b) => b.at.localeCompare(a.at));
}

export const STATE_LABEL: Record<ReceiptState, string> = {
  prepared: "Prepared, not sent", sent: "Sent (you confirmed)", replied: "Replied", no_reply: "No reply yet", blocked: "Blocked", would_pay: "Said they would pay", paid: "Paid", unknown: "Unknown",
};

export interface Tally { people: number; prepared: number; sent: number; replied: number; noReply: number; blocked: number; wouldPay: number; paid: number }
export function tally(events: ExperimentEvent[]): Tally {
  const r = receipts(events);
  const n = (s: ReceiptState) => r.filter((x) => x.state === s).length;
  return { people: r.length, prepared: n("prepared"), sent: n("sent"), replied: n("replied"), noReply: n("no_reply"), blocked: n("blocked"), wouldPay: n("would_pay"), paid: n("paid") };
}

/** Rule-based, proportionate next move. Silence is never read as "no interest". */
export function nextMove(t: Tally): { headline: string; why: string } {
  const contacted = t.sent + t.replied + t.noReply + t.wouldPay + t.paid;
  if (t.people === 0) return { headline: "Add the first five people you will ask.", why: "Nothing is recorded yet. Five is enough to learn something without spamming anyone." };
  if (contacted === 0 && t.prepared > 0) return { headline: `Review and send the ${t.prepared} message${t.prepared === 1 ? "" : "s"} you prepared, then mark each one as sent.`, why: "Prepared is not sent. Nothing has reached anyone yet." };
  if (t.paid > 0) return { headline: `${t.paid} ${t.paid === 1 ? "person has" : "people have"} paid. Ask whether they would pay again, and what made them say yes.`, why: "Payment is the strongest evidence there is. A second payment is stronger still." };
  if (t.wouldPay > 0) return { headline: `Ask the ${t.wouldPay} who said they would pay to pay for a small pilot now, with a price and a date.`, why: "Saying they would pay is weaker than paying. A small, real pilot shows which it is." };
  if (t.replied > 0) return { headline: `Talk to the ${t.replied} ${t.replied === 1 ? "person who replied" : "people who replied"}: ask what they do today and what it costs them.`, why: "A reply is the strongest thing you have so far. Ask about the past, not about your idea." };
  if (contacted >= 5 && t.replied === 0) return { headline: "No replies from five or more people. Change one thing, then ask five different people.", why: "Silence does not mean no interest. It could be the contact, the message, the timing, or the problem. Change only one of them so you can tell which." };
  if (contacted > 0) return { headline: `Wait for replies, then ${5 - contacted > 0 ? `ask ${5 - contacted} more` : "follow up once"}.`, why: `${contacted} contacted, ${t.replied} replied. Too few to conclude anything.` };
  return { headline: "Record what happened with each person.", why: "Only what you confirm is counted." };
}

export const DECISION_LABEL: Record<Decision, string> = {
  continue: "Keep going the same way", change_message: "Change the message", change_audience: "Ask a different audience", test_other: "Test a different problem", stop: "Stop this experiment",
};

/** A short block for Coach and the Work tools, so advice starts from what really happened. */
export function experimentBlock(e: Experiment | null): string {
  if (!e) return "";
  const evs = e.events ?? [];
  const t = tally(evs);
  const lines = [
    `CURRENT CUSTOMER EXPERIMENT (what the founder is testing, and what they confirmed happened; nothing here is guessed):`,
    `Goal: ${e.goal}`,
    e.hypothesis ? `Hypothesis: ${e.hypothesis}` : "",
    e.audience ? `Audience: ${e.audience}` : "",
    `People recorded: ${t.people}. Prepared: ${t.prepared}. Sent: ${t.sent}. Replied: ${t.replied}. Said they would pay: ${t.wouldPay}. Paid: ${t.paid}. No reply yet: ${t.noReply}. Blocked: ${t.blocked}.`,
    e.status === "decided" && e.decision ? `Decision: ${DECISION_LABEL[e.decision]}${e.decision_note ? ` (${e.decision_note})` : ""}` : "",
    "No reply is not the same as no interest. Do not claim anyone was contacted unless it says Sent.",
  ];
  return lines.filter(Boolean).join("\n");
}
