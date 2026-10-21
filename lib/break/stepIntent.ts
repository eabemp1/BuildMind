/**
 * lib/break/stepIntent.ts — what a step in a Break My Startup result is asking
 * the founder to do, and which BuildMind tools do that work. "Do a deep
 * competitor scan" opens the competitor scan. "Research" opens the competitor
 * scan and the other research tools (who to talk to, an interview kit).
 * Deterministic: the same words always lead to the same tools.
 */
import { prepKindFor, type PrepKind } from "@/lib/prep/kinds";

export interface StepAction { id: string; label: string; kind: PrepKind; task: string }

const INTENTS: Array<{ re: RegExp; kinds: PrepKind[] }> = [
  { re: /\b(compet\w*|alternatives?|incumbents?|landscape|benchmark\w*|market scan|market research)\b/i, kinds: ["competitor_brief"] },
  { re: /\b(research|investigat\w*|look into|find out|explor\w*|study|diligence|discover\w*)\b/i, kinds: ["competitor_brief", "prospects", "validation_kit"] },
  { re: /\b(interview\w*|talk to|conversations?|survey\w*|customer discovery|validate|validation)\b/i, kinds: ["validation_kit", "prospects"] },
  { re: /\b(pric(?:e|es|ing)|willing(?:ness)? to pay|monetiz\w*|charge)\b/i, kinds: ["pricing_test"] },
  { re: /\b(reach out|cold (?:email|dm|message)|outreach|message|dm|email)\b/i, kinds: ["outreach"] },
  { re: /\b(launch|show hn|product hunt|go live)\b/i, kinds: ["launch_plan"] },
];

const LABEL: Partial<Record<PrepKind, string>> = {
  competitor_brief: "Run competitor scan", prospects: "Find who to talk to", validation_kit: "Interview kit", pricing_test: "Pricing test", outreach: "Draft outreach", launch_plan: "Launch plan",
};
const PREFIX: Partial<Record<PrepKind, string>> = {
  competitor_brief: "Research competitors and alternatives:", prospects: "Find the people who have this problem:", validation_kit: "Plan customer interviews:", pricing_test: "Test pricing:", outreach: "Draft outreach:", launch_plan: "Plan the launch:",
};

/** Which crew agent on /agents does the work a step describes. Competitor words win over generic research. */
export function agentFor(step: string): "competitor" | "research" | "validation" | null {
  const t = String(step ?? "");
  if (t.trim().length < 8) return null;
  if (/\b(compet\w*|alternatives?|incumbents?|landscape|benchmark\w*|market scan)\b/i.test(t)) return "competitor";
  if (/\b(interview\w*|talk to|survey\w*|customer discovery|validate|validation)\b/i.test(t)) return "validation";
  if (/\b(research|investigat\w*|look into|find out|explor\w*|study|diligence|discover\w*)\b/i.test(t)) return "research";
  return null;
}

export function stepActions(step: string, max = 3): StepAction[] {
  const text = String(step ?? "").trim();
  if (text.length < 8) return [];
  const kinds: PrepKind[] = [];
  for (const i of INTENTS) if (i.re.test(text)) for (const k of i.kinds) if (!kinds.includes(k)) kinds.push(k);
  return kinds.slice(0, max).flatMap((kind) => {
    const task = `${PREFIX[kind]} ${text}`.slice(0, 560);
    return prepKindFor(task, null) === kind ? [{ id: kind, label: LABEL[kind] as string, kind, task }] : [];
  });
}
