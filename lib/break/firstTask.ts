/**
 * lib/break/firstTask.ts — the first task shown under a Break My Startup verdict.
 *
 * Pure, no AI call. The task is the weakest spot's own test, or the one thing to do now. The draft message is a plain
 * template filled from what the person typed, so it costs nothing and never invents facts.
 */
export interface FirstTask { task: string; message: string }

const clean = (s: string | undefined, max: number): string => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function buildFirstTask(input: {
  idea: string; targetUsers?: string; problem?: string; weakestTest?: string; advice?: string;
}): FirstTask | null {
  const task = clean(input.weakestTest, 280) || clean(input.advice, 280);
  if (!task) return null;
  const who = clean(input.targetUsers, 60);
  const problem = clean(input.problem, 90) || clean(input.idea, 90);
  const opener = who ? `I'm talking to ${who.charAt(0).toLowerCase()}${who.slice(1)} about ` : "I'm talking to people about ";
  const message = `Hi [name], ${opener}${problem.replace(/[.\s]+$/, "")}. Could I ask you 3 quick questions about how you handle it today? It takes 10 minutes and I'm not selling anything.`;
  return { task, message };
}
