/**
 * lib/actionClassification.ts
 *
 * Pure, dependency-free keyword classification of an action/task string into
 * a type ("outreach", "content", ...) and platform ("linkedin", "email", ...).
 *
 * Extracted out of lib/learning.ts (which is server-side only — it imports
 * createAdminClient) so that client-side code needing the same
 * classification — specifically lib/founderMemory.ts's observeTaskEvent(),
 * called from app/today/page.tsx — doesn't pull server-only code into the
 * browser bundle. lib/learning.ts re-exports these for backward
 * compatibility; existing imports from "@/lib/learning" keep working
 * unchanged.
 */

export type ActionType =
  | "user_interview"
  | "content"
  | "outreach"
  | "build"
  | "research"
  | "pivot"
  | "pricing"
  | "other";

export type ActionPlatform =
  | "linkedin"
  | "whatsapp"
  | "twitter"
  | "email"
  | "reddit"
  | "instagram"
  | "slack"
  | "phone"
  | "other";

/**
 * inferActionType — categorises an action string into a type label.
 * Keyword-based, fast, no LLM needed.
 */
export function inferActionType(action: string): ActionType {
  const a = action.toLowerCase();
  if (/interview|talk to|speak with|call|user research|conversation|ask \d+ people/i.test(a))
    return "user_interview";
  // pricing check before content — "publish your pricing" should be pricing not content.
  // But exclude: "payment integration" (build), "analyse/research pricing strategies" (research).
  // Require pricing/charge/monetize NOT preceded by research/analyse/study verbs,
  // and exclude "payment integration" patterns.
  if (
    /\bprice|pricing|charge|subscription|revenue|monetize\b/i.test(a) &&
    !/payment.*(integrat|gateway|api|system|process)|integrat.*payment/i.test(a) &&
    !/(?:research|analys[ei]s?|analyz|study|compare|look.up|find).*(?:pric|charg|subscript)/i.test(a)
  )
    return "pricing";
  if (/post|write|publish|content|article|tweet|thread|blog|share/i.test(a))
    return "content";
  if (/message|reach out|dm|email|contact|outreach|send to \d+|cold/i.test(a))
    return "outreach";
  if (/build|code|develop|deploy|launch|create|implement|ship/i.test(a))
    return "build";
  if (/research|analyse|analyze|search|find|look up|compare|study/i.test(a))
    return "research";
  if (/pivot|niche|reposition|change target|different market/i.test(a))
    return "pivot";
  return "other";
}

/**
 * inferActionPlatform — extracts the primary platform from action text.
 */
export function inferActionPlatform(action: string): ActionPlatform {
  const a = action.toLowerCase();
  if (/linkedin/i.test(a)) return "linkedin";
  if (/whatsapp/i.test(a)) return "whatsapp";
  if (/twitter|tweet|x\.com/i.test(a)) return "twitter";
  if (/email|gmail|inbox/i.test(a)) return "email";
  if (/reddit|subreddit/i.test(a)) return "reddit";
  if (/instagram/i.test(a)) return "instagram";
  if (/slack/i.test(a)) return "slack";
  if (/phone|call|call them|ring/i.test(a)) return "phone";
  return "other";
}

const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  user_interview: "user interviews",
  content: "content creation",
  outreach: "direct outreach",
  build: "building/shipping",
  research: "research",
  pivot: "pivoting",
  pricing: "pricing conversations",
  other: "other tasks",
};

/**
 * actionCategoryLabel — a human-readable "category" for a task, combining
 * type + platform where the platform adds information (e.g. "direct outreach
 * (linkedin)"). This is what should be stored in founder_memory's
 * avoidance_zones/strengths — a genuine behavioral category, not a raw
 * fragment of the task's title text.
 */
export function actionCategoryLabel(action: string): string {
  const type = inferActionType(action);
  const platform = inferActionPlatform(action);
  const typeLabel = ACTION_TYPE_LABELS[type];
  return platform === "other" ? typeLabel : `${typeLabel} (${platform})`;
}
