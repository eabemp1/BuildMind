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
 * SPECIFIC_LABELS — a much richer, differentiated layer on top of the
 * 8-bucket ActionType system above. That system stays untouched (nothing
 * else that reads inferActionType/inferActionPlatform is affected), but
 * "content creation (linkedin)" swallowing everything from a thought-
 * leadership post to a quick comment to a case study is exactly the
 * "too generic, too much packed into one category" problem — this fixes
 * it for the label actually shown to founders (avoidance_zones/strengths
 * in founder_memory, surfaced in Founder Mirror/Insights).
 *
 * Ordered most-specific-first: the first pattern that matches wins. Falls
 * through to the old broad label (via actionCategoryLabel below) only if
 * nothing here matches — so this never returns "nothing," it just adds a
 * sharper first attempt before the safety net.
 *
 * Each label is deliberately short (2-4 words) and names the actual thing,
 * not a bucket — "cold DMs" not "outreach," "churn interviews" not "user
 * interviews," "pricing page copy" not "pricing conversations."
 */
const SPECIFIC_LABELS: Array<{ test: RegExp; label: string }> = [
  // ── Customer/user conversations — split out of user_interview ──
  { test: /churn(ed)?\s*(user|customer)|why.*(left|cancel|stop.*using)|exit interview/i, label: "churn interviews" },
  { test: /support (ticket|request|conversation|chat)|help.*(user|customer).*(with|troubleshoot)/i, label: "support conversations" },
  { test: /sales call|demo call|discovery call|closing call/i, label: "sales calls" },
  { test: /user (testing|test session)|usability (test|session)|watch.*use.*product/i, label: "usability testing" },
  { test: /customer interview|talk to (customer|user)s?\b/i, label: "customer interviews" },

  // ── Content — split out of "content" ──
  { test: /linkedin.*(thought.leadership|insight|perspective|opinion)/i, label: "LinkedIn thought leadership" },
  { test: /comment on|reply to.*(thread|post)|engage with.*(post|thread)/i, label: "community engagement" },
  { test: /twitter thread|x thread|tweet.*thread/i, label: "Twitter threads" },
  { test: /case study|customer story|success story/i, label: "case studies" },
  { test: /newsletter|email digest/i, label: "newsletter writing" },
  { test: /video|demo (reel|clip)|record.*(walkthrough|screen)/i, label: "video content" },
  { test: /blog (post|article)|write.*article/i, label: "blog writing" },
  { test: /seo|keyword|search ranking/i, label: "SEO content" },
  { test: /post|write|publish|content|tweet|thread|blog|share/i, label: "content creation" },

  // ── Outreach — split out of "outreach" ──
  { test: /investor|vc\b|fundrais/i, label: "investor outreach" },
  { test: /partner(ship)?|integrat.*partner|co.market/i, label: "partnership outreach" },
  { test: /influencer|creator.*collab/i, label: "influencer outreach" },
  { test: /cold (dm|message|email)/i, label: "cold outreach" },
  { test: /warm intro|referral (ask|outreach)/i, label: "warm intros" },
  { test: /message|reach out|dm|email|contact|send to \d+/i, label: "direct outreach" },

  // ── Building — split out of "build" ──
  { test: /bug|fix.*(issue|error|crash)|hotfix/i, label: "bug fixing" },
  { test: /\b(ui|ux)\b|design.*(screen|flow|interface)|wireframe/i, label: "UI/UX design" },
  { test: /integrat|api|webhook|third.party/i, label: "integrations work" },
  { test: /infra|deploy|hosting|scaling|performance/i, label: "infrastructure work" },
  { test: /onboarding flow|signup flow|activation flow/i, label: "onboarding flow work" },
  { test: /build|code|develop|deploy|launch|create|implement|ship/i, label: "core feature building" },

  // ── Pricing/revenue — split out of "pricing" ──
  { test: /pricing page|pricing copy/i, label: "pricing page copy" },
  { test: /billing|invoice|payment (flow|integration|processing)/i, label: "billing/payments work" },
  { test: /\bprice|pricing|charge|subscription|revenue|monetize\b/i, label: "pricing decisions" },

  // ── Research — split out of "research" ──
  { test: /competitor|competitive analysis/i, label: "competitor research" },
  { test: /market (size|research|analysis)|tam\b/i, label: "market research" },
  { test: /research|analyse|analyze|search|find|look up|compare|study/i, label: "research" },

  // ── Admin/ops/growth — previously all fell into "other tasks" ──
  { test: /hire|hiring|job (post|listing)|candidate/i, label: "hiring" },
  { test: /legal|contract|compliance|terms of service|privacy policy/i, label: "legal/compliance" },
  { test: /investor update|board (deck|update|meeting)/i, label: "investor updates" },
  { test: /financial (model|plan|projection)|budget|runway/i, label: "financial planning" },
  { test: /paid ad|ad campaign|google ads|facebook ads/i, label: "paid ads" },
  { test: /referral program|affiliate/i, label: "referral programs" },
  { test: /product hunt|launch day|press|pr\b/i, label: "launch prep" },
  { test: /roadmap|prioritis|prioritiz/i, label: "roadmap planning" },
  { test: /pivot|niche|reposition|change target|different market/i, label: "pivoting" },
];

/**
 * actionCategoryLabel — a human-readable "category" for a task, combining
 * type + platform where the platform adds information (e.g. "direct outreach
 * (linkedin)"). This is what should be stored in founder_memory's
 * avoidance_zones/strengths — a genuine behavioral category, not a raw
 * fragment of the task's title text.
 *
 * Tries SPECIFIC_LABELS first (a much richer, differentiated set — see
 * above), falls back to the original broad ActionType label only if
 * nothing more specific matches. inferActionType/inferActionPlatform
 * themselves are untouched — nothing else reading those is affected.
 */
export function actionCategoryLabel(action: string): string {
  const specific = SPECIFIC_LABELS.find((entry) => entry.test.test(action));
  const platform = inferActionPlatform(action);
  if (specific) {
    const alreadyNamesPlatform = platform !== "other" && specific.label.toLowerCase().includes(platform);
    return platform === "other" || alreadyNamesPlatform ? specific.label : `${specific.label} (${platform})`;
  }
  const type = inferActionType(action);
  const typeLabel = ACTION_TYPE_LABELS[type];
  return platform === "other" ? typeLabel : `${typeLabel} (${platform})`;
}
