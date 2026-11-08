/**
 * lib/language.ts — one rule that keeps AI replies in the language the founder writes in. Pure.
 * It is a prompt line, not a detector: the model reads the founder's own words and matches them.
 */
export const LANGUAGE_RULE =
  "LANGUAGE: Write every word the founder will read in the language the founder wrote in (if they mix languages, use the one in their main text). Keep JSON keys, enum values and tags exactly as specified, in English. If you cannot tell, use English.";

export function withLanguageRule(prompt: string): string {
  return prompt.includes(LANGUAGE_RULE) ? prompt : `${prompt}\n\n${LANGUAGE_RULE}`;
}
