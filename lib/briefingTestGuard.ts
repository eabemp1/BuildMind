/**
 * lib/briefingTestGuard.ts: on a test run the morning briefing must not read a behaviour pattern out of made-up history.
 * Anything that says the founder is avoiding, dodging or putting something off is replaced with an honest line.
 */
const PATTERN_CLAIM = /\b(?:avoid(?:s|ing|ance)?|dodg\w+|putting off|put off|procrastinat\w+|keep (?:skipping|delaying|postponing|ignoring)|keeps? (?:skipping|delaying|postponing|ignoring)|ghost\w*|steering clear|shy(?:ing)? away|flinch\w*|stalling)\b/i;
export const TEST_RUN_RISK = "This account is a test run, so there is no real history to read a pattern from. No habit or avoidance is claimed.";

export function dropPatternClaims(text: string, testRun: boolean): string {
  if (!testRun || !text || !PATTERN_CLAIM.test(text)) return text;
  const kept = text.split(/(?<=[.!?])\s+/).filter((s) => !PATTERN_CLAIM.test(s)).join(" ").trim();
  return kept || TEST_RUN_RISK;
}

export function guardBriefing<T extends { win?: string; risk?: string }>(b: T, testRun: boolean): T {
  if (!testRun) return b;
  return { ...b, win: dropPatternClaims(b.win ?? "", true) || b.win, risk: dropPatternClaims(b.risk ?? "", true) };
}
