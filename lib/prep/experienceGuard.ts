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
  // "I was chatting with a friend who runs a bike shop", "I recently spoke with a shop owner", "we met a customer"
  /\b(?:i|we)(?:'ve| have| had| was| were)?\s+(?:recently |just |actually |also )?(?:chat(?:ted|ting)|talk(?:ed|ing)|spok(?:e|en|ing)|speak(?:ing)?|met|meeting|catch(?:ing)? up|sat down|bump(?:ed|ing) into|ran into|caught up|texted|messaged|emailed|called|phoned|asked)\s+(?:to |with )?(?:a|an|my|one|some|the|two|three|several|a few)\s+[^.?!\n]{0,40}/gi,
  // "a friend who runs a bike shop", "my cousin, who owns a garage", "one of my contacts said"
  /\b(?:a|an|my|one of my|the)\s+(?:close |old |good |longtime |long-time )?(?:friend|buddy|neighbou?r|cousin|uncle|aunt|brother|sister|colleague|mentor|acquaintance|contact|relative|classmate)\b[^.?!\n]{0,30}\b(?:who|that|whose|runs|owns|ran|owned|told|said|mentioned|complained|shared)\b[^.?!\n]{0,40}/gi,
  // "a shop owner I know", "an owner I met", "someone I know who runs a shop"
  /\b(?:a|an|one|some(?:one)?)\s+[^.?!\n]{0,25}\b(?:owner|manager|customer|client|user|founder|person|someone)\s+(?:that |who )?(?:i|we)\s+(?:know|knew|met|spoke|talked|worked)\b[^.?!\n]{0,40}/gi,
  /\bsomeone (?:i|we) know\b[^.?!\n]{0,40}/gi,
  // Things the founder claims to have seen: "I noticed a shop owner struggling", "I watched a customer wait"
  /\b(?:i|we)\s+(?:saw|noticed|watched|observed|overheard|witnessed|visited|walked into|stopped by)\s+(?:a|an|the|one|some|two|three|several)\s+[^.?!\n]{0,40}\b(?:owner|customer|shop|store|staff|queue|line|client|user)\b[^.?!\n]{0,30}/gi,
  /\b(?:the other day|a few (?:days|weeks|months) ago|a while (?:back|ago)|last (?:time|night)|yesterday)\b[^.?!\n]{0,40}\b(?:i|we)\s+(?:was|were|saw|noticed|met|spoke|talked|chatted|heard|visited)\b[^.?!\n]{0,40}/gi,
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
  // Where, how long or how safely data is kept: a promise the founder has to make, never the model.
  /\b(?:we|our (?:app|team|system|platform)|the (?:app|platform|system)|BuildMind)\s+(?:store|stores|keep|keeps|retain|retains|delete|deletes|encrypt|encrypts|back up|backs up|host|hosts)\b[^.?!\n]{0,60}\b(?:data|information|records|bookings|messages|details|files)\b/gi,
  /\b(?:data|information|records|bookings|messages|details|files)\s+(?:is|are|will be|gets|get|stay|stays|remain|remains)\s+(?:securely\s+)?(?:stored|hosted|kept|saved|encrypted|backed up|retained|deleted|processed|private|confidential)\b[^.?!\n]{0,50}/gi,
  /\b(?:securely|safely|encrypted)\s+(?:stored|hosted|kept|saved)\b[^.?!\n]{0,40}|\b(?:stored|hosted|kept|saved)\s+(?:in|on|within|at)\s+(?:the\s+)?(?:eu|uk|us|europe|ghana|africa|the cloud|aws|google cloud|azure|our servers|secure servers|your (?:device|phone|computer))\b/gi,
  /\b(?:data\s+(?:retention|residency)|(?:servers?|data ?cent(?:er|re)s?)\s+(?:are\s+)?(?:located\s+)?in)\b[^.?!\n]{0,40}/gi,
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

const PRIVACY_TOPIC = /\b(?:privacy|private|confidential\w*|personal (?:data|information)|data|gdpr|ccpa|encrypt\w*|secur(?:e|ely|ity)|stor(?:e|es|ed|age)|retain\w*|retention|delet\w+|erase\w*|sell|sells|sold|share|shares|shared|sharing|third[- ]part\w+|cookies?|consent|opt[- ]out|anonymi[sz]\w*)\b/i;
const PRIVACY_MARKER = "[add: your privacy answer]";

/**
 * Any sentence that makes a statement about privacy, data handling or security is the founder's promise to make.
 * Questions, [add: ...] markers and topics the founder's own text already covers are left alone.
 */
export function scrubPrivacyPromises(text: string, allowed = ""): string {
  if (!text) return text;
  const known = allowed.toLowerCase();
  return text.replace(/[^.!?\n]+(?:[.!?]+|$)/g, (sentence) => {
    const t = sentence.trim();
    if (!t || t.includes("[add:") || t.endsWith("?")) return sentence;
    const hits = t.toLowerCase().match(new RegExp(PRIVACY_TOPIC.source, "gi")) ?? [];
    if (!hits.length || hits.every((h) => known.includes(h))) return sentence;
    const lead = sentence.match(/^\s*/)?.[0] ?? "";
    return `${lead}${PRIVACY_MARKER}`;
  });
}

export const NO_INVENTED_EXPERIENCE = "Never invent the founder's own experience, customers, conversations, quotes, mistakes or results, and never state a price, policy, feature or privacy promise the founder has not given. Where one is needed, leave an [add: ...] marker for the founder to fill in, or write it as a question.";
