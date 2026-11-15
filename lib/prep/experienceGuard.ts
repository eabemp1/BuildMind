/**
 * lib/prep/experienceGuard.ts: one check for everything a founder might send or publish.
 * Drafts must not invent the founder's own experience (a shop they own, a customer who told them something,
 * conversations they never had) or commercial and privacy promises nobody decided on.
 * Pure text rules. A match is allowed only when the founder's own text (`allowed`) already says it.
 */

const EXPERIENCE: RegExp[] = [
  /\bI (?:own|owned|run|ran|manage|managed|co-?own|founded|started)\s+(?:a|an|my|the)\s+[^.?!\n]{0,40}\b(?:shop|store|business|company|restaurant|clinic|studio|agency|salon|garage)\b/gi,
  /\b(?:i|we)\s+(?:used to|previously|once)\s+(?:own|run|work|worked|manage)\w*\b[^.?!\n]{0,40}/gi,
  /\b(?:last|this past|earlier this)\s+(?:week|month|year|weekend)\b[^.?!\n]{0,60}\b(?:customer|client|owner|shop|someone|user|person)\b/gi,
  /\b(?:a|one|another|several|many|some|\d+|three|five|ten|dozens of)\s+(?:of my\s+)?(?:customers?|clients?|shop owners?|owners?|users?|founders?|people)\s+(?:i (?:know|spoke|talked)\s+)?(?:told|said|asked|complained|mentioned|shared|emailed|messaged|called)\b/gi,
  /\b(?:i|we)(?:'ve| have| had)?\s+(?:spoken|talked|chatted|met|interviewed|heard from)\s+(?:to |with )?(?:\d+|several|many|a few|some|dozens of|a number of)?\s*(?:shop owners?|owners?|customers?|users?|founders?|people|businesses|shops)\b/gi,
  /\b(?:shop owners?|owners?|customers?|users?|founders?|people)\s+(?:i(?:'ve| have)?|we(?:'ve| have)?)\s+(?:spoken|talked|chatted|met|interviewed)\s+(?:to|with)\b/gi,
  /\b(?:my|our)\s+(?:customers?|clients?|users?|beta testers?|first customers?)\b/gi,
  /\b(?:i|we)\s+(?:made|learned|learnt|lost|messed up|failed)\b[^.?!\n]{0,40}\b(?:mistake|lesson)\b/gi,
];

const TERMS: RegExp[] = [
  /\b(?:cut|cuts|cutting|reduce|reduces|halve|halves|slash|double|doubles|triple|boost|boosts|increase|increases|save|saves|saving)\b[^.?!\n]{0,40}\b(?:in half|by half|by \d+|\d+%|twice|[2-9]x|10x)\b/gi,
  /\bcancel(?:l?ation)?\s+(?:any\s?time|anytime|at any time|whenever)\b/gi,
  /\bno (?:contracts?|lock-?in|hidden fees|setup fees?|credit card required)\b/gi,
  /\b(?:money-?back|refund) guarantee\b|\b\d+-day (?:refund|money-?back)\b/gi,
  /\bunlimited\s+[a-z]+(?:\s+[a-z]+)?/gi,
  /\b(?:24\/7|round-the-clock)\s+support\b/gi,
  /\bfree (?:trial|plan|tier|forever|setup|onboarding)\b/gi,
  /\b(?:we|your data)\s+(?:never|will never|do not|don't)\s+(?:sell|share|store|track)\b|\b(?:gdpr|hipaa|soc ?2)[- ]?(?:compliant|certified)?\b|\bend-to-end encrypt\w*\b|\bbank-?level (?:security|encryption)\b/gi,
  /\b(?:pay|payments?)\s+(?:by|with|via)\s+(?:card|cash|stripe|paypal|mobile money|apple pay)\b/gi,
];

function unsupported(text: string, allowed: string, rules: RegExp[]): string[] {
  const known = allowed.toLowerCase();
  const out: string[] = [];
  for (const r of rules) {
    for (const m of text.matchAll(new RegExp(r.source, r.flags))) {
      const hit = m[0].trim();
      if (!known.includes(hit.toLowerCase()) && !out.includes(hit)) out.push(hit);
    }
  }
  return out;
}

/** First-person experience the founder never stated (owning a shop, customers who told them things, past conversations). */
export function inventedExperience(text: string, allowed = ""): string[] {
  return unsupported(text, allowed, EXPERIENCE);
}

/** Prices, policies, features and privacy promises the founder never stated. */
export function inventedTerms(text: string, allowed = ""): string[] {
  return unsupported(text, allowed, TERMS);
}

export const NO_INVENTED_EXPERIENCE = "Never invent the founder's own experience, customers, conversations, quotes, mistakes or results, and never state a price, policy, feature or privacy promise the founder has not given. Where one is needed, leave an [add: ...] marker for the founder to fill in, or write it as a question.";
