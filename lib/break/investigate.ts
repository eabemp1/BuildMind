/**
 * lib/break/investigate.ts — which agent checks a claim from a Break My Startup report.
 * Deterministic, same words same agent. Competitor words go to the competitor agent,
 * customer and price words to the validation agent, everything else to research.
 */
import { agentFor } from "@/lib/break/stepIntent";

export type InvestigateAgent = "competitor" | "research" | "validation";

export function agentForClaim(claim: string): InvestigateAgent {
  const a = agentFor(claim);
  if (a) return a;
  if (/\b(pric(?:e|es|ing)|pay|paying|willing|budget|buy|customers?|users?|demand|want|need)\b/i.test(claim)) return "validation";
  return "research";
}

export interface InvestigateContext { projectId?: string | null; idea?: string }

/** The body for POST /api/agents/run. A saved project wins over idea text. */
export function investigateBody(claim: string, ctx: InvestigateContext) {
  const focus = claim.replace(/\s+/g, " ").trim().slice(0, 300);
  return {
    agentType: agentForClaim(focus),
    focus,
    ...(ctx.projectId ? { projectId: ctx.projectId } : ctx.idea ? { idea: ctx.idea.trim().slice(0, 800) } : {}),
  };
}

/** A check needs a claim long enough to mean something and some context to run against. */
export function canInvestigate(claim: string, ctx: InvestigateContext): boolean {
  return claim.trim().length >= 8 && Boolean(ctx.projectId || (ctx.idea && ctx.idea.trim().length >= 8));
}
