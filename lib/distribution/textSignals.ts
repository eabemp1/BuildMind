/**
 * lib/distribution/textSignals.ts — facts measurable from the draft text itself.
 * These are observations, not scores: each one carries the text it was found in.
 */
export type Platform = "linkedin" | "x" | "reddit" | "hn" | "other";

export const PLATFORM_LIMITS: Record<Platform, number | null> = { linkedin: 3000, x: 280, reddit: null, hn: 80, other: null };

const PLATITUDES = [
  "game changer", "game-changer", "at the end of the day", "move the needle", "hustle", "grind", "10x",
  "the key to success", "success is", "founders who win", "most founders fail", "in today's fast-paced",
  "let that sink in", "here's the truth", "unlock your potential", "build in public",
];
const HEDGES = ["maybe", "perhaps", "sort of", "kind of", "i think", "somewhat", "just", "i guess"];

export interface TextSignals {
  words: number;
  firstLine: string;
  firstLineWords: number;
  opensWithQuestion: boolean;
  opensWithCoinedTerm: string | null;
  productMentions: number;
  productPer100Words: number;
  hasNumbers: boolean;
  firstPerson: number;
  questions: number;
  endsWithQuestion: boolean;
  platitudes: string[];
  hedges: number;
  links: number;
  overLimitBy: number;
}

export function analyseText(body: string, platform: Platform, product = "buildmind"): TextSignals {
  const text = body.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const firstLine = (text.split(/\n/).find((l) => l.trim()) ?? "").trim();
  const firstLineWords = firstLine ? firstLine.split(/\s+/).length : 0;
  const lower = text.toLowerCase();
  const productMentions = (lower.match(new RegExp(product, "g")) ?? []).length;
  // A Title Case run of 3–4 words in the first 18 words, or a quoted phrase, reads as a coined term.
  const head = firstLine.split(/\s+/).slice(0, 18).join(" ");
  const coined = head.match(/(?:[A-Z][a-z]+(?:\s+|$)){3,4}/g)?.map((m) => m.trim()).find((m) => m.split(/\s+/).length >= 3 && !/^(The|This|That|I|My|We)\b/.test(m));
  const quoted = head.match(/["“]([^"”]{4,40})["”]/)?.[1];
  const limit = PLATFORM_LIMITS[platform];
  return {
    words,
    firstLine,
    firstLineWords,
    opensWithQuestion: /\?\s*$/.test(firstLine),
    opensWithCoinedTerm: quoted ?? coined ?? null,
    productMentions,
    productPer100Words: words ? Math.round((productMentions / words) * 1000) / 10 : 0,
    hasNumbers: /\d/.test(text),
    firstPerson: (lower.match(/\b(i|my|me|we|our)\b/g) ?? []).length,
    questions: (text.match(/\?/g) ?? []).length,
    endsWithQuestion: /\?\s*$/.test(text),
    platitudes: PLATITUDES.filter((p) => lower.includes(p)),
    hedges: HEDGES.reduce((n, h) => n + (lower.match(new RegExp(`\\b${h}\\b`, "g")) ?? []).length, 0),
    links: (text.match(/https?:\/\//g) ?? []).length,
    overLimitBy: limit && text.length > limit ? text.length - limit : 0,
  };
}

export interface Observation { key: string; status: "ok" | "watch"; label: string; detail: string }

/** Plain statements of what the text does. Never framed as a score. */
export function observe(s: TextSignals, platform: Platform): Observation[] {
  const o: Observation[] = [];
  if (!s.words) return o;
  o.push(s.firstLineWords > 22
    ? { key: "opening-length", status: "watch", label: "Long opening line", detail: `The first line is ${s.firstLineWords} words. Feeds usually truncate early, so the hook may be cut off.` }
    : { key: "opening-length", status: "ok", label: "Compact opening line", detail: `The first line is ${s.firstLineWords} words.` });
  if (s.opensWithCoinedTerm) o.push({ key: "coined-term", status: "watch", label: "Opens with a term the reader has to learn", detail: `"${s.opensWithCoinedTerm}" appears in the opening. Readers meet vocabulary before they recognise a situation.` });
  if (s.opensWithQuestion) o.push({ key: "opens-question", status: "ok", label: "Opens with a question", detail: "A question in the first line invites a reply, if it is specific." });
  o.push(s.productPer100Words > 1.5
    ? { key: "product-density", status: "watch", label: "Product mentioned often", detail: `${s.productMentions} mention${s.productMentions === 1 ? "" : "s"} in ${s.words} words (${s.productPer100Words} per 100). Heavy promotion tends to close the conversation.` }
    : { key: "product-density", status: "ok", label: "Light on promotion", detail: `${s.productMentions} product mention${s.productMentions === 1 ? "" : "s"} in ${s.words} words.` });
  o.push(s.questions === 0
    ? { key: "no-question", status: "watch", label: "No question anywhere", detail: "Nothing explicitly invites the reader to add their own experience." }
    : { key: "question", status: "ok", label: s.endsWithQuestion ? "Ends with a question" : "Contains a question", detail: `${s.questions} question mark${s.questions === 1 ? "" : "s"}.` });
  o.push(!s.hasNumbers && s.firstPerson === 0
    ? { key: "specificity", status: "watch", label: "No numbers and no first-person detail", detail: "Nothing places the post in a specific situation or moment." }
    : { key: "specificity", status: "ok", label: "Contains concrete detail", detail: [s.hasNumbers ? "numbers" : "", s.firstPerson ? `${s.firstPerson} first-person reference${s.firstPerson === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ") + "." });
  if (s.platitudes.length) o.push({ key: "platitudes", status: "watch", label: "Familiar phrases", detail: `Contains: ${s.platitudes.map((p) => `"${p}"`).join(", ")}.` });
  if (s.hedges >= 3) o.push({ key: "hedges", status: "watch", label: "Hedging language", detail: `${s.hedges} hedging words (maybe, just, I think…) soften the claim.` });
  if (s.overLimitBy > 0) o.push({ key: "length", status: "watch", label: "Over the platform limit", detail: `${s.overLimitBy} characters over the ${platform} limit.` });
  return o;
}
