/**
 * lib/radar/classify.ts — decides what a pasted thing IS, deterministically.
 * A hackathon is not a conference with a hackathon track, a webinar is not a
 * workshop, a grant is not an event. When the evidence is close the result is
 * marked unconfirmed and the founder is asked, never guessed for.
 */
import type { RadarKind, PersonRole } from "@/lib/radar/types";

const MEETING_HOSTS = /(?:^|\.)(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|calendly\.com|cal\.com|savvycal\.com|whereby\.com|tidycal\.com)$/i;
const PERSON_HOSTS = /(?:^|\.)(?:linkedin\.com\/in|x\.com|twitter\.com|github\.com)$/i;

export function hostOf(raw: string): string {
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}
export function isMeetingUrl(raw: string): boolean { return MEETING_HOSTS.test(hostOf(raw)); }
export function isProfileUrl(raw: string): boolean {
  try { const u = new URL(raw); const h = u.hostname.toLowerCase().replace(/^www\./, ""); return (h === "linkedin.com" && /^\/in\//.test(u.pathname)) || ((h === "x.com" || h === "twitter.com" || h === "github.com") && /^\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)); } catch { return false; }
}

// Each rule: pattern, weight. Title hits count triple, body hits once.
const RULES: Record<Exclude<RadarKind, "meeting" | "person">, [RegExp, number][]> = {
  hackathon:   [[/\bhack(?:athon|day|fest)\b|\bbuild(?:athon| weekend)\b|\bgame jam\b/i, 5]],
  competition: [[/\b(?:pitch|startup|business|innovation) (?:competition|contest|challenge)\b|\bpitch (?:day|off|battle)\b|\bprize\b/i, 4]],
  grant:       [[/\bgrants?\b|\bnon-?dilutive\b|\bfunding (?:call|opportunity|round)\b|\bseed fund(?:ing)?\b|\bfellowship\b/i, 5]],
  accelerator: [[/\baccelerator\b|\bincubator\b|\bcohort\b|\by combinator\b|\btechstars\b|\bapplications? (?:are )?open\b/i, 4]],
  conference:  [[/\bconference\b|\bsummit\b|\bexpo\b|\bcongress\b|\bforum\b|\bkeynote\b/i, 4]],
  workshop:    [[/\bworkshop\b|\bbootcamp\b|\bmasterclass\b|\btraining (?:session|day)\b|\bhands-on\b/i, 4]],
  webinar:     [[/\bwebinar\b|\blive ?stream\b|\bvirtual (?:talk|session|event|fireside)\b|\bonline (?:talk|session|event)\b|\bAMA\b/i, 4]],
  meetup:      [[/\bmeet-?up\b|\bmixer\b|\bnetworking (?:night|event|evening)\b|\bfounders'? (?:dinner|night|breakfast)\b|\bdemo (?:night|day)\b|\bcoffee\b/i, 4]],
};

export interface Classification {
  kind: RadarKind;
  confidence: number;          // 0..1
  confirmed: boolean;          // true only when the evidence is clear
  alternatives: RadarKind[];
  why: string;
}

export function classifyOpportunity(input: { title?: string; text?: string; url?: string }): Classification {
  const title = input.title ?? "";
  const body = input.text ?? "";
  if (input.url && isProfileUrl(input.url)) return { kind: "person", confidence: 0.95, confirmed: true, alternatives: [], why: "The link is a personal profile." };
  if (input.url && isMeetingUrl(input.url) && !/\b(?:webinar|conference|summit|workshop|hackathon)\b/i.test(`${title} ${body}`)) {
    return { kind: "meeting", confidence: 0.9, confirmed: true, alternatives: [], why: "The link is a call or scheduling link." };
  }
  const score: Partial<Record<RadarKind, number>> = {};
  for (const [kind, rules] of Object.entries(RULES) as [keyof typeof RULES, [RegExp, number][]][]) {
    for (const [re, w] of rules) {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
      const t = (title.match(g) ?? []).length, b = Math.min(3, (body.match(g) ?? []).length);
      if (t || b) score[kind] = (score[kind] ?? 0) + w * (t * 3 + b);
    }
  }
  // Same-page overlaps that are known to be confusable: a conference/meetup with a "prize" or "cohort" is still that event.
  if ((score.conference ?? 0) >= 12 && score.competition && !/\bcompetition|contest\b/i.test(title)) delete score.competition;
  if ((score.meetup ?? 0) >= 12 && score.accelerator && !/\baccelerator|incubator\b/i.test(title)) delete score.accelerator;
  if ((score.hackathon ?? 0) > 0 && (score.conference ?? 0) > 0 && !/\bhack/i.test(title)) delete score.hackathon;

  const ranked = (Object.entries(score) as [RadarKind, number][]).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { kind: "meetup", confidence: 0.2, confirmed: false, alternatives: ["conference", "webinar", "workshop"], why: "Nothing in the text says what kind of thing this is." };
  const [top, second] = ranked;
  const margin = second ? top[1] / Math.max(1, top[1] + second[1]) : 1;
  const confidence = Math.min(0.97, 0.45 + margin * 0.5);
  const confirmed = confidence >= 0.75 && top[1] >= 12;
  return { kind: top[0], confidence, confirmed, alternatives: ranked.slice(1, 3).map((r) => r[0]), why: confirmed ? `The text says "${top[0]}" clearly.` : "The text could describe more than one kind. Confirm which it is." };
}

const ROLE_RULES: [PersonRole, RegExp][] = [
  ["investor", /\b(?:investor|venture|vc|angel|partner at|general partner|principal at|seed fund)\b/i],
  ["cofounder", /\b(?:co-?founder|looking for a (?:co-?founder|technical partner)|cto|seeking partner)\b/i],
  ["mentor", /\b(?:mentor|advisor|adviser|coach|operator|ex-|former|vp of|head of|director)\b/i],
  ["customer", /\b(?:freelancer|founder|owner|manager|student|developer|designer|marketer|consultant)\b/i],
];
export function classifyRole(text: string): PersonRole {
  for (const [role, re] of ROLE_RULES) if (re.test(text)) return role;
  return "other";
}
