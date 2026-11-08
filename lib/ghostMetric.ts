/**
 * lib/ghostMetric.ts — what a weekly goal is measured by. Pure.
 *
 * A goal says "talk to 3 people" and the banner used to show execution score and Today actions, neither of which is
 * about that sentence. BuildMind records three things a goal can honestly be measured by, so the goal's own wording
 * picks one: conversations started, replies received, or Today actions finished. The number comes from the sentence
 * when it has one; otherwise the stored target is used. Nothing is stored for this: it is read from the text each time.
 */
export type GoalMetricKind = "conversations" | "replies" | "actions";

export interface GoalMetric { kind: GoalMetricKind; label: string; target: number | null }

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function numberIn(text: string): number | null {
  const m = text.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
  if (!m) return null;
  const n = /^\d/.test(m[1]) ? Number(m[1]) : WORDS[m[1].toLowerCase()];
  return n >= 1 && n <= 20 ? n : null;
}

export function goalMetric(goalText: string): GoalMetric {
  const t = (goalText ?? "").toLowerCase();
  if (/\b(repl(?:y|ies|ied)|respon(?:d|ds|se|ses)|book(?:s|ed)? a call|commitment|pre-?pa(?:y|id)|sign(?:s|ed)? up|agree[sd]?)\b/.test(t))
    return { kind: "replies", label: "Replies this week", target: numberIn(t) };
  if (/\b(talk(?:s|ing)? to|speak(?:s|ing)? to|call(?:s|ing)?|interview(?:s|ing)?|conversations?|messag(?:e|es|ing)|reach(?:es|ing)? out|email(?:s|ing)?|dm|ask(?:s|ing)?|contact(?:s|ing)?|pitch(?:es|ing)?)\b/.test(t))
    return { kind: "conversations", label: "Conversations started", target: numberIn(t) };
  return { kind: "actions", label: "Today actions done", target: null };
}

/** Counts for one week from the founder's own people records. */
export function countConversations(people: Array<{ status: string; contacted_at: string | null }>, weekStartIso: string): { started: number; replies: number } {
  const from = Date.parse(`${weekStartIso}T00:00:00Z`);
  let started = 0, replies = 0;
  for (const p of people) {
    const t = p.contacted_at ? Date.parse(p.contacted_at) : NaN;
    if (!Number.isFinite(t) || t < from || p.status === "to_contact") continue;
    started++;
    if (["replied", "booked", "done"].includes(p.status)) replies++;
  }
  return { started, replies };
}
