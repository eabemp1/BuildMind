/**
 * lib/firstDaysBrief.ts — extra instructions for the first days, when there
 * is no history to personalise from.
 *
 * With no past actions or reflections the prompt has almost nothing in it, and
 * the model drifts to the safest generic task ("research your market", "post
 * on LinkedIn"). That is exactly the moment the product has to prove itself.
 * Thin history means the founder's OWN words are the richest signal available,
 * so this brief forces the task to be built from them, to produce evidence, and
 * to say when it is done.
 */

export interface FirstDaysInput {
  actionsShown: number;          // tasks shown so far in this project
  reflections: number;
  stage: string;
  title?: string;
  problem?: string;
  targetUsers?: string;
  description?: string;
}

export function isThinHistory(i: Pick<FirstDaysInput, "actionsShown" | "reflections">): boolean {
  return i.actionsShown < 3 && i.reflections < 2;
}

const q = (s?: string, n = 160) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? `"${t.length > n ? `${t.slice(0, n - 1)}…` : t}"` : "";
};

export function buildFirstDaysBrief(i: FirstDaysInput): string {
  if (!isThinHistory(i)) return "";
  const words = [
    i.problem ? `Problem in their words: ${q(i.problem)}` : "",
    i.targetUsers ? `Who they say it is for: ${q(i.targetUsers)}` : "",
    i.description ? `What they are building: ${q(i.description)}` : "",
  ].filter(Boolean);

  const stageRule =
    i.stage === "Idea"
      ? "At Idea stage the only task worth doing is learning from a real person about the problem: no building, no branding, no market-size research."
      : i.stage === "Validation"
      ? "At Validation stage the task must test whether someone will commit time, data or money, not just say they like it."
      : "Pick the task that produces the most new evidence about what is blocking progress at this stage.";

  return `FIRST DAYS BRIEF (this founder has little history, so their own words are your best signal):
${words.join("\n")}
${stageRule}
- Build the task from the founder's own words above. A reader should be able to tell it was written for THIS business and could not be pasted onto another one.
- Choose an action whose output is evidence or a concrete artifact (a conversation held, a reply received, a page live), never "think about", "research" or "plan".
- Make it finishable in 30-45 minutes and say what "done" looks like in the rationale (for example "done when you have 3 replies or 3 sent messages").
- If a draft message is requested, it must open with a question about the person's last real experience with the problem. It must not pitch the product.
- Do not give a generic task that would suit any startup.`;
}

/** Count the numbered entries in a personalisation block ("1. ...", "2. ..."). */
export function countBlockEntries(block: string | undefined): number {
  return (block ?? "").split("\n").filter(l => /^\d+\.\s/.test(l.trim())).length;
}
