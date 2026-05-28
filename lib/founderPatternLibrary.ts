/**
 * Founder pattern library from the uploaded implementation package.
 *
 * The only functional edit here is the markdown-required tag boost:
 * onboarding-insight can pass extracted tags, and matching patterns receive
 * extra score when those tags overlap with known keywords or pattern names.
 */

export interface FounderPattern {
  id: string;
  stage: string;
  archetype?: string;
  blockerMatch?: string[];
  keywords: string[];
  pattern: string;
  lesson: string;
  source: string;
  type: "failure" | "success" | "both";
}

export interface MatchedPattern extends FounderPattern {
  matchScore: number;
}

export const FOUNDER_PATTERN_LIBRARY: FounderPattern[] = [
  {
    id: "b2b-saas-validation-stall",
    stage: "Validation",
    blockerMatch: ["no_users_yet", "dont_know_what_to_do"],
    keywords: ["saas", "b2b", "software", "tool", "platform", "dashboard", "api", "workflow", "automation"],
    pattern: "B2B SaaS validation stall",
    lesson: "B2B founders at Validation most commonly stall by building before they have 10 discovery calls. Your first 10 days should be all outreach; a Notion doc is enough to validate with.",
    source: "YC Group Partner retrospective, W23",
    type: "failure",
  },
  {
    id: "b2b-pricing-avoidance",
    stage: "MVP",
    blockerMatch: ["no_revenue", "dont_know_what_to_do"],
    keywords: ["saas", "b2b", "enterprise", "business", "company", "team", "subscription"],
    pattern: "B2B pricing avoidance",
    lesson: "Founders with B2B products delay pricing conversations too long. Charging earlier does not kill deals; it finds out which prospects are real.",
    source: "First Round Capital before Series A playbook",
    type: "failure",
  },
  {
    id: "consumer-feature-bloat",
    stage: "MVP",
    blockerMatch: ["building_too_slow", "too_many_ideas"],
    keywords: ["app", "consumer", "users", "social", "community", "marketplace", "mobile"],
    pattern: "Consumer feature bloat before traction",
    lesson: "Consumer products that ship too many core features before 100 active users rarely find fit with those features. Pick the one flow that proves the core value.",
    source: "IndieHackers postmortem analysis",
    type: "failure",
  },
  {
    id: "consumer-niche-first",
    stage: "Validation",
    keywords: ["app", "consumer", "social", "community", "network"],
    pattern: "Niche-first consumer wins",
    lesson: "Every consumer network that scaled started hyper-local or hyper-niche. Trying to be for everyone at Validation is a signal the real user is still unclear.",
    source: "a16z consumer playbook",
    type: "success",
  },
  {
    id: "solo-founder-isolation",
    stage: "*",
    blockerMatch: ["no_users_yet", "dont_know_what_to_do"],
    keywords: [],
    archetype: "validation-avoider",
    pattern: "Solo founder build-in-isolation spiral",
    lesson: "Solo founders without external accountability are more likely to stall in isolation. One person asking what shipped this week breaks the loop better than another productivity system.",
    source: "YC Solo Founder retrospective",
    type: "failure",
  },
  {
    id: "nocode-premature-scale",
    stage: "MVP",
    keywords: ["no-code", "nocode", "bubble", "webflow", "airtable", "zapier", "glide", "retool"],
    pattern: "No-code premature polish trap",
    lesson: "No-code founders often spend longer on polish before first users. Ship ugly and learn fast; no-code debt is cheaper to fix than wrong direction.",
    source: "IndieHackers no-code cohort retrospective",
    type: "failure",
  },
  {
    id: "ai-product-demo-gap",
    stage: "Validation",
    blockerMatch: ["no_users_yet", "building_too_slow"],
    keywords: ["ai", "ml", "llm", "gpt", "machine learning", "model", "intelligence", "openai", "claude", "gemini"],
    pattern: "AI product demo-to-retention gap",
    lesson: "AI products demo better than they retain. Validation must include someone using it unsupervised for a real workflow, not just reacting to a demo.",
    source: "AI product PMF research synthesis",
    type: "failure",
  },
  {
    id: "ai-wrapper-differentiation",
    stage: "Idea",
    keywords: ["ai", "llm", "gpt", "openai", "wrapper", "chat", "assistant"],
    pattern: "AI wrapper differentiation failure",
    lesson: "AI wrappers that do not own a workflow or dataset commoditize quickly. The moat must be the data collected or the workflow replaced, not the prompt.",
    source: "YC AI batch retrospective",
    type: "failure",
  },
  {
    id: "marketplace-chicken-egg",
    stage: "Validation",
    keywords: ["marketplace", "two-sided", "buyers", "sellers", "supply", "demand", "platform", "connect"],
    pattern: "Marketplace chicken-and-egg solved wrong",
    lesson: "Marketplaces that build both sides simultaneously usually fail. Manually provide supply first, then prove demand before automating supply.",
    source: "Marketplace PMF research",
    type: "failure",
  },
  {
    id: "fintech-compliance-delay",
    stage: "MVP",
    blockerMatch: ["building_too_slow"],
    keywords: ["fintech", "finance", "payment", "banking", "lending", "insurance", "compliance", "regulated", "license"],
    pattern: "Regulated industry compliance-first delay",
    lesson: "Regulated founders can validate problem and workflow before a license. Compliance is usually a build constraint, not a reason to avoid discovery.",
    source: "Fintech founder retrospective",
    type: "failure",
  },
  {
    id: "technical-founder-sales-avoidance",
    stage: "*",
    archetype: "technical-overbuilder",
    keywords: ["engineer", "developer", "technical", "built", "code", "api", "backend", "infrastructure"],
    pattern: "Technical founder sales avoidance",
    lesson: "Technical founders often delay first sales conversations. The code is not the risk; the conversation is.",
    source: "YC Group Partner patterns",
    type: "failure",
  },
  {
    id: "idea-stage-research-spiral",
    stage: "Idea",
    blockerMatch: ["dont_know_what_to_do", "too_many_ideas"],
    keywords: [],
    pattern: "Idea stage research spiral",
    lesson: "Founders who stay in Idea stage without a single user conversation usually discover the first hypothesis was wrong. Talk before building.",
    source: "Sequoia Arc program retrospective",
    type: "failure",
  },
  {
    id: "free-tier-trap",
    stage: "Launch",
    blockerMatch: ["no_revenue"],
    keywords: ["free", "freemium", "free tier", "free plan", "free trial"],
    pattern: "Free tier conversion trap",
    lesson: "Products that launch free before validating willingness to pay convert far worse when pricing arrives. Ask for payment or commitment before building free-tier logic.",
    source: "Pricing research synthesis",
    type: "failure",
  },
  {
    id: "planning-over-shipping",
    stage: "*",
    archetype: "methodical-slow-mover",
    blockerMatch: ["building_too_slow", "dont_know_what_to_do"],
    keywords: [],
    pattern: "Planning-over-shipping stall",
    lesson: "The plan does not reduce risk as much as the first user conversation. Ship the smallest thing that can teach you something.",
    source: "Founder velocity study",
    type: "failure",
  },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function findMatchingPatterns(
  ideaText: string,
  stage: string,
  blocker: string,
  extractedTags: string[] = [],
  archetype?: string,
): MatchedPattern[] {
  const haystack = normalize(`${ideaText} ${blocker} ${extractedTags.join(" ")}`);
  const tagSet = new Set(extractedTags.map(normalize).filter(Boolean));

  const scored: MatchedPattern[] = FOUNDER_PATTERN_LIBRARY.map((pattern) => {
    let score = 0;
    if (pattern.stage === "*" || pattern.stage === stage) score += 3;
    if (pattern.blockerMatch?.includes(blocker)) score += 2;
    for (const keyword of pattern.keywords) {
      if (haystack.includes(normalize(keyword))) score += 1;
    }
    if (archetype && pattern.archetype === archetype) score += 1;

    const patternWords = normalize(`${pattern.pattern} ${pattern.lesson} ${pattern.keywords.join(" ")}`);
    for (const tag of tagSet) {
      if (tag && patternWords.includes(tag)) score += 2;
    }

    return { ...pattern, matchScore: score };
  });

  return scored
    .filter((pattern) => pattern.matchScore >= 3)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3);
}

export function buildPatternSeeds(patterns: MatchedPattern[]): { text: string; created_at: string }[] {
  const now = new Date().toISOString();
  return patterns.map((pattern) => ({
    text: `[Pattern signal - ${pattern.pattern}] ${pattern.lesson}`,
    created_at: now,
  }));
}
