/**
 * lib/avoidanceSanitize.ts
 *
 * Pure guard for avoidance zones / repeated topics.
 *
 * Why: two LLM-backed writers (reflect-action's extractAndWritePatterns and
 * founder-insight's synthesis) store whatever string the model returns. In
 * production one of them stored a slice of a reflection note verbatim -
 *   "Tried: I didn't try anything toda, I was engaged in a different work |
 *    Learned: Let us try again tomorrow"
 * - as an avoidance zone. Today then told the model "You've been avoiding
 * Tried: I didn't try anything toda...", and the decision layer treated it as a
 * real avoidance pattern (confidence 0.95) and switched to "challenge" mode.
 *
 * An avoidance zone is a short behavioural CATEGORY ("cold outreach",
 * "pricing conversations"), never a quote. Anything that looks like a quote is
 * recategorised through the shared task taxonomy, or dropped.
 *
 * No server imports: safe on the client and in the decision layer.
 */

import { actionCategoryLabelOrNull } from "@/lib/actionClassification";

const MAX_LABEL_LENGTH = 60;
// "Tried: ...", "Learned: ...", "Result: ...", pipes, and newlines are the
// separators the reflection form uses to join its fields into `note`.
const QUOTE_MARKERS = /\b(tried|learned|result|happened|note|blocker)\s*:|\||\n/i;

export function looksLikeQuotedText(entry: string): boolean {
  const t = entry.trim();
  return t.length > MAX_LABEL_LENGTH || QUOTE_MARKERS.test(t);
}

/** Returns a clean category label, or null if the entry cannot be salvaged. */
export function cleanAvoidanceEntry(entry: unknown): string | null {
  if (typeof entry !== "string") return null;
  const t = entry.trim();
  if (!t) return null;
  if (!looksLikeQuotedText(t)) return t;
  return actionCategoryLabelOrNull(t);
}

/** Clean, case-insensitively de-duplicated list, original order kept. */
export function sanitizeAvoidanceZones(entries: unknown, limit = 10): string[] {
  if (!Array.isArray(entries)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of entries) {
    const cleaned = cleanAvoidanceEntry(raw);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= limit) break;
  }
  return out;
}

/** Topics are themes, not categories: only strip quote-shaped entries, never reclassify. */
export function sanitizeTopics(entries: unknown, limit = 10): string[] {
  if (!Array.isArray(entries)) return [];
  const out: string[] = [];
  for (const raw of entries) {
    if (typeof raw !== "string") continue;
    const t = raw.trim();
    if (!t || looksLikeQuotedText(t)) continue;
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}
