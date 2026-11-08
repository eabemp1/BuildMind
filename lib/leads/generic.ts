/**
 * lib/leads/generic.ts — what the lead finder must never return as a "lead". Pure.
 * Big founder communities are not customers, and every startup gets the same list otherwise.
 */
const GENERIC_RE = [
  /r\/(startups?|entrepreneur|saas|micro_?saas|smallbusiness|sideproject|indiehackers|buildinpublic|business)\b/i,
  /reddit\.com\/r\/(startups?|entrepreneur|saas|micro_?saas|smallbusiness|sideproject|indiehackers)\b/i,
  /indiehackers\.com|producthunt\.com|news\.ycombinator\.com|hackernews|betalist\.com|crunchbase\.com/i,
  /\b(y combinator|product hunt|indie hackers|hacker news)\b/i,
  /\b(startup|founders?) (community|group|subreddit|forum)s?\b/i,
];

export function isGenericLead(name: string, url: string, allow = false): boolean {
  if (allow) return false; // the founder's customers ARE founders, so founder communities are real leads
  const text = `${name} ${url}`;
  return GENERIC_RE.some((re) => re.test(text));
}
