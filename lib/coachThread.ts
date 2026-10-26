/**
 * lib/coachThread.ts — what the coach remembers of the conversation it is in.
 *
 * Before: the last 4 messages, each cut to 500 characters. A coach reply is longer than that, so the coach saw
 * its own earlier answers chopped mid-sentence, and the founder's first question vanished after two exchanges.
 * That is why it "forgot" and drifted.
 *
 * Now, within a fixed character budget (the free-tier token ceiling is why there is one):
 *   1. ORIGINAL QUESTION: the first thing the founder asked in this thread, kept whole.
 *   2. EARLIER: one short line per older message, so the thread is never lost.
 *   3. RECENT: the last messages in full-ish. Founder messages are kept longer than coach replies, because what the
 *      founder meant matters more than what the coach said. Long coach replies keep their opening AND their ending
 *      (the ending is usually the question or next step the founder is answering).
 *   4. A pointer note when the latest message is short or refers back ("that", "do it", "why?"), telling the coach
 *      to resolve it from the thread instead of starting a new topic.
 * Pure and deterministic. No model call.
 */

export interface ThreadMessage { role: "user" | "assistant"; content: string }

export const THREAD_BUDGET_CHARS = 4800;
const RECENT_COUNT = 6;
const USER_RECENT_MAX = 700;
const COACH_RECENT_HEAD = 330;
const COACH_RECENT_TAIL = 150;
const EARLIER_LINE_MAX = 110;
const EARLIER_LINES = 8;
const ORIGINAL_MAX = 600;

const PLACEHOLDERS = [/^BuildMind couldn't generate a response/i, /^I'm having trouble responding/i, /^Coach unavailable/i];

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function cleanThread(raw: Array<{ role?: unknown; content?: unknown }>): ThreadMessage[] {
  const out: ThreadMessage[] = [];
  for (const m of raw) {
    const content = clean(String(m?.content ?? ""));
    if (!content) continue;
    const role = m?.role === "assistant" ? "assistant" : "user";
    if (role === "assistant" && PLACEHOLDERS.some((p) => p.test(content))) continue;
    // Collapse accidental double sends of the same founder message.
    const last = out[out.length - 1];
    if (last && last.role === role && last.content === content) continue;
    out.push({ role, content });
  }
  return out;
}

const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

function coachRecent(s: string): string {
  if (s.length <= COACH_RECENT_HEAD + COACH_RECENT_TAIL + 20) return s;
  return `${s.slice(0, COACH_RECENT_HEAD).trimEnd()} … ${s.slice(-COACH_RECENT_TAIL).trimStart()}`;
}

const REFERS_BACK = /\b(it|that|this|those|these|them|the (first|second|third|last|other) (one|option)|same|again|more|why|how so|do it|go on|continue|yes|yeah|ok(ay)?|sure|no)\b/i;

/** True when the latest message cannot be understood without the thread. */
export function refersBack(message: string): boolean {
  const m = clean(message);
  if (!m) return false;
  return m.length <= 60 || REFERS_BACK.test(m.slice(0, 80));
}

export function buildThreadBlock(history: ThreadMessage[], latest: string): string {
  if (!history.length) return "";
  const original = history.find((m) => m.role === "user");
  const recent = history.slice(-RECENT_COUNT);
  const older = history.slice(0, Math.max(0, history.length - RECENT_COUNT));
  const parts: string[] = [];

  // Only show the original question separately when it has scrolled out of the recent window.
  const originalInRecent = original ? recent.includes(original) : true;
  if (original && !originalInRecent) parts.push(`ORIGINAL QUESTION THIS CONVERSATION STARTED WITH:\nFounder: ${cut(original.content, ORIGINAL_MAX)}`);

  const olderLines = older.filter((m) => m !== original).slice(-EARLIER_LINES).map((m) => `${m.role === "user" ? "Founder" : "Coach"}: ${cut(m.content, EARLIER_LINE_MAX)}`);
  if (olderLines.length) parts.push(`EARLIER IN THIS CONVERSATION (short):\n${olderLines.join("\n")}`);

  const recentLines = recent.map((m) => `${m.role === "user" ? "Founder" : "Coach"}: ${m.role === "user" ? cut(m.content, USER_RECENT_MAX) : coachRecent(m.content)}`);
  parts.push(`MOST RECENT MESSAGES:\n${recentLines.join("\n")}`);

  if (refersBack(latest)) {
    const lastCoach = [...history].reverse().find((m) => m.role === "assistant");
    parts.push(`The founder's latest message is short or refers back. Read it as a reply to the conversation above${lastCoach ? ", most of all to your last answer" : ""}. Do not start a new topic.`);
  }

  let block = parts.join("\n\n");
  // Budget: drop the oldest lines first, never the recent messages or the pointer note.
  if (block.length > THREAD_BUDGET_CHARS) {
    const trimmedEarlier = olderLines.slice(-3);
    const rebuilt: string[] = [];
    if (original && !originalInRecent) rebuilt.push(`ORIGINAL QUESTION THIS CONVERSATION STARTED WITH:\nFounder: ${cut(original.content, 300)}`);
    if (trimmedEarlier.length) rebuilt.push(`EARLIER IN THIS CONVERSATION (short):\n${trimmedEarlier.join("\n")}`);
    rebuilt.push(...parts.filter((p) => p.startsWith("MOST RECENT") || p.startsWith("The founder's latest")));
    block = rebuilt.join("\n\n");
  }
  return `\n\nCONVERSATION SO FAR (this is the thread you are in; the founder's latest message continues it):\n${block}`;
}

/**
 * Did the founder actually ask what to do next? The "Recommended next step" card used to appear on almost every
 * reply (the model added it whenever it could), so it read as noise and its button did not even do that step.
 * It is now shown only when the founder asked for a next step, a plan, a priority or where to start.
 */
const NEXT_STEP_ASK = /\b(what (should|do|can) (i|we)\b|what'?s (the )?next|next step|where (do|should) i (start|begin)|how do i (start|begin|get started)|what now|prioriti[sz]e|which (one|task|thing) (first|should)|plan (for|my)|give me a plan|action plan|first step|what to do|help me (decide|choose|pick))/i;

export function wantsNextStep(message: string): boolean {
  return NEXT_STEP_ASK.test(clean(message));
}
