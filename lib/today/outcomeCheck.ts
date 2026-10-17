/**
 * lib/today/outcomeCheck.ts — does the outcome the founder tapped match what
 * they wrote?
 *
 * Real data: "Nailed it" with "I don't have any beta users" (nothing was done),
 * "Got blocked" with "I didn't try anything today, I was engaged in different
 * work". A wrong "completed" inflates streak and momentum, flips the task to
 * done, and teaches the generator that an impossible task worked.
 *
 * We only ever DOWNGRADE, only on strong textual evidence, and return the
 * reason so the UI can say so instead of silently rewriting history.
 */

export type ReportedOutcome = "completed" | "partial" | "blocked" | "learned";
export type CheckedOutcome = ReportedOutcome | "abandoned";

export interface OutcomeCheckInput {
  outcome: ReportedOutcome;
  what_tried?: string | null;
  what_happened?: string | null;
  what_learned?: string | null;
  blocker?: string | null;
  note?: string | null;
}

export interface OutcomeCheckResult {
  outcome: CheckedOutcome;
  adjusted: boolean;
  from?: ReportedOutcome;
  reason?: string;
}

// Could not do it because a prerequisite did not exist.
const NO_PREREQ_RE = /\b(?:i\s+)?(?:do\s*n[o']?t|don'?t|dont|didn'?t|did\s+not|haven'?t|have\s+not|can'?t|cannot|couldn'?t|could\s+not)\s+(?:yet\s+)?(?:have|got|find|found|get|access|reach|locate)\b|\bno\s+(?:access|users?|beta\s+users?|customers?|one\s+to)\b|\bdo\s*n[o']?t\s+have\s+any\b/i;

// Did not do it at all.
const NO_ACTION_RE = /\b(?:i\s+)?(?:did\s+nothing|did\s*n[o']?t\s+(?:try|do|start|touch|work\s+on|get\s+to|attempt)(?:\s+(?:much|anything))?|have\s*n[o']?t\s+(?:really\s+)?(?:touched|started|done|tried)(?:\s+anything)?|(?:was|got)\s+(?:engaged|busy|distracted)\s+(?:in|with)|did\s+something\s+else|worked\s+on\s+something\s+else|(?:different|other)\s+work|nothing\s+(?:today|yet))\b/i;

// Affirmative evidence of real work. If present we leave the outcome alone.
const DID_SOMETHING_RE = /\b(?:\d+|one|two|three|four|five)\s+(?:replies|reply|dms?|emails?|posts?|calls?|messages?|signups?|users?|likes|views|upvotes|comments)\b|\b(?:posted|sent|published|shipped|launched|emailed|called|messaged|interviewed|joined|wrote|drafted|submitted)\b/i;

function body(i: OutcomeCheckInput): string {
  return [i.what_tried, i.what_happened, i.note]
    .filter((s): s is string => typeof s === "string" && s.trim() !== "" && s.trim().toLowerCase() !== "null")
    .join(" \n ");
}

export function checkOutcome(i: OutcomeCheckInput): OutcomeCheckResult {
  const keep: OutcomeCheckResult = { outcome: i.outcome, adjusted: false };
  if (i.outcome === "learned") return keep;
  const text = body(i);
  if (!text.trim()) return keep;
  if (DID_SOMETHING_RE.test(text) && !NO_ACTION_RE.test(text)) return keep;

  const noAction = NO_ACTION_RE.test(text);
  const noPrereq = NO_PREREQ_RE.test(text);

  if (i.outcome === "completed" || i.outcome === "partial") {
    if (noAction) return { outcome: "abandoned", adjusted: true, from: i.outcome, reason: "You wrote that you didn't do the task, so it is logged as not done." };
    if (noPrereq) return { outcome: "blocked", adjusted: true, from: i.outcome, reason: "You wrote that something you needed didn't exist, so it is logged as blocked, not completed." };
  }
  if (i.outcome === "blocked" && noAction && !(i.blocker ?? "").trim()) {
    return { outcome: "abandoned", adjusted: true, from: i.outcome, reason: "No blocker was named and you said you worked on something else, so it is logged as not done." };
  }
  return keep;
}
