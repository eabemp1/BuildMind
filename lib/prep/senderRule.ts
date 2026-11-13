/**
 * lib/prep/senderRule.ts — one rule for every prompt that writes something the founder will send.
 * Without it a draft can hand the founder's own news to the reader ("I noticed you just got two users")
 * or claim to have seen something about a stranger.
 */
export const SENDER_RULE = `The founder is the SENDER. Facts about the founder, their product, signups or milestones are the founder's: write them in the first person ("I just got my first two users"), never as facts about the reader. Never say you saw, noticed, read or heard anything about the reader unless the text above states exactly that.`;

const SAYS_NOT_BUILT = /\b(no product|not (yet )?built|haven['’]?t built|have not built|idea[-\s]?stage|pre[-\s]?product|fictional|hypothetical|doesn['’]?t exist yet|does not exist yet|only an idea|no (pricing|prices?) (yet)?)\b/i;

/** The founder's own words say there is no product yet (stage labels can lag behind what the founder knows). */
export function statesNotBuilt(text: string | undefined | null): boolean {
  return SAYS_NOT_BUILT.test(String(text ?? ""));
}

/** Stages at which there is usually nothing for a stranger to use yet, or the founder's text says so. */
export function productNotBuilt(stage: string | undefined | null, founderText = ""): boolean {
  return /^(idea|validation|research|pre[-\s]?mvp)$/i.test(String(stage ?? "").trim()) || statesNotBuilt(founderText);
}

/** What a draft may say about the product, by stage. Empty when the product exists. */
export function productClaimsRule(stage: string | undefined | null, founderText = ""): string {
  if (!productNotBuilt(stage, founderText)) return "Only describe what the product does using facts given above. Never state a price, a free offer or a feature that the text above does not state.";
  return "THE PRODUCT DOES NOT EXIST YET. Do not offer it, invite anyone to try or test it, call it free or priced, or say it sends, books or does anything. Write as someone researching a problem or considering building something: \"I'm researching how repair shops handle collections\", \"I'm thinking of building a tool for this\". The ask is a conversation or a story, never a sign-up.";
}

const OFFERS_A_PRODUCT = /\b(free (tool|app|service|trial|to (use|try))|try (it|our|my|the (app|tool))|sign up|sign-up|beta (access|users?|testers?)|early access|join (the )?(waitlist|beta)|our (app|tool|product|platform|service)|(i|we)['’]?(ve| have)? (built|made|launched|created) |[a-z]+ (reminder|booking|scheduling|messaging) (tool|app|system|service|software)|that (sends|texts|reminds|books|automates)|(it|we|my (app|tool)) sends?|already (sends?|books?|works?)|\$\s?\d|£\s?\d|GHS\s?\d|per month)\b/i;

/** Pure: does the text offer or describe a product the founder has not built? `allowed` is the founder's own text. */
export function offersMissingProduct(text: string, allowed: string): boolean {
  const m = text.match(OFFERS_A_PRODUCT);
  if (!m) return false;
  return !allowed.toLowerCase().includes(m[0].toLowerCase());
}
