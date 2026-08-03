/**
 * lib/textTruncate.ts
 *
 * Confirmed the actual cause of "tasks cut off mid-sentence": several
 * places across the app truncate AI-generated text with a bare
 * `.slice(0, N)` and no ellipsis, or (worse) a word-count cap with no
 * ellipsis at all — app/api/ai/today-action/route.ts's extractActionTitle()
 * was the most visible instance, capping at 12 words with nothing to
 * indicate the text had been cut. This is a display bug, not something
 * that needs AI summarization to fix — summarizing would add a model call's
 * worth of latency and cost for a problem a word-boundary-safe slice
 * already solves for free.
 *
 * Two functions:
 *  - truncateChars: character-based cap, breaks on the last whole word
 *    before the limit (never cuts mid-word) and appends "…" only when the
 *    text was actually cut.
 *  - truncateWords: word-count cap, same ellipsis discipline.
 *
 * Both are pure, no dependencies — safe to import anywhere.
 */

export function truncateChars(text: string, maxChars: number): string {
  const trimmed = (text ?? "").trim();
  if (trimmed.length <= maxChars) return trimmed;
  const cut = trimmed.slice(0, maxChars);
  // Back off to the last whole word so we never split a word in half.
  const lastSpace = cut.lastIndexOf(" ");
  const clean = lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${clean.replace(/[.,;:—-]+$/, "").trim()}…`;
}

export function truncateWords(text: string, maxWords: number): string {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return trimmed;
  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) return trimmed;
  return `${words.slice(0, maxWords).join(" ").replace(/[.,;:—-]+$/, "").trim()}…`;
}
