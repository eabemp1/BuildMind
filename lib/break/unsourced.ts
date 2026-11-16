/**
 * lib/break/unsourced.ts: remove statements a model made up about research nobody did.
 * BuildMind has no survey results, and no record of interviews inside Break My Startup, so a line that
 * quotes a survey statistic or says N interviews were done is dropped, not shown as fact.
 */
const SURVEY_STAT = /\b\d{1,3}(?:\.\d+)?\s?%[^.]{0,80}\b(?:survey(?:ed)?|respondents?|polled)\b|\b(?:survey(?:ed)?|respondents?|polled)\b[^.]{0,80}\b\d{1,3}(?:\.\d+)?\s?%/i;
const DONE_INTERVIEWS = /\b(?:completed|conducted|done|held|did|had|ran|finished|after)\s+(?:\w+\s+){0,2}(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:customer\s+|user\s+)?(?:interviews?|conversations?|calls?)\b|\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:customer\s+|user\s+)?interviews?\s+(?:completed|conducted|done|held|so far)\b/i;

export function hasUnsourcedResearchClaim(text: string): boolean {
  return SURVEY_STAT.test(text) || DONE_INTERVIEWS.test(text);
}

export function stripUnsourcedResearch(list: string[]): string[] {
  return list.filter((t) => !hasUnsourcedResearchClaim(t));
}
