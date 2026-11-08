/**
 * lib/break/firstTask.ts — the first task shown under a Break My Startup verdict.
 *
 * The AI writes it with the verdict (one task and one message for this idea). `readFirstTask` checks it before it is shown.
 * When the run has no AI answer, or the answer fails the checks, `fallbackFirstTask` gives a plain task and message that
 * paste none of the founder's text, so they can never read as gibberish.
 */
import { guardRules } from "@/lib/today/rules";

export interface FirstTask { task: string; message: string }

const clean = (s: unknown, max: number): string => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");
const TECHNICAL_RE = /\b(?:scrap\w*|crawl\w*|apis?|sdk|scripts?|dataset|database|backend|pipeline)\b/i;
const BRACKET_RE = /\[[^\]]*\]/g;

/** The AI's task and message, only if both are real, plain, short and safe. Never cuts text. */
export function readFirstTask(raw: unknown): FirstTask | null {
  const o = (raw ?? {}) as { task?: unknown; message?: unknown };
  const task = clean(o.task, 600);
  const message = clean(o.message, 700);
  if (task.length < 25 || task.length > 220 || TECHNICAL_RE.test(task) || guardRules(task).length > 0) return null;
  if (message.length < 40 || message.length > 450 || TECHNICAL_RE.test(message)) return null;
  // The only placeholder allowed is the person's name.
  if ((message.match(BRACKET_RE) ?? []).some((b) => !/^\[(?:name|their name)\]$/i.test(b))) return null;
  if (!/\?/.test(message)) return null;
  return { task, message };
}

export function fallbackFirstTask(): FirstTask {
  return {
    task: "Ask one person who has this problem what they did the last time it happened. Write down their exact words.",
    message: "Hi [name], I'm trying to understand how people deal with a problem I think you know well. Could I ask you 3 quick questions? It takes 10 minutes and I'm not selling anything.",
  };
}
