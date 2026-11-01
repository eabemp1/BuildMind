/** lib/today/builtClaim.ts — does the founder say their product is already built? Pure. */
export const BUILT_RE = /\b(?:i['’]?ve|i have|we['’]?ve|we have|already|just)\s+(?:built|launched|shipped|finished|released)\b|\bis\s+(?:now\s+)?(?:live|launched)\b/i;
export const saysBuilt = (text: string): boolean => BUILT_RE.test(text ?? "");
