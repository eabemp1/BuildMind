import type { RadarItem, RadarPrep } from "@/lib/radar/types";

export function prepFallback(i: Pick<RadarItem, "kind" | "title" | "type">): RadarPrep {
  const q: Record<string, string[]> = {
    person: ["What is the hardest part of this for you right now?", "How do you handle it today?", "Who else should I talk to?"],
    meeting: ["What would make this call worth your time?", "What do you already know about this problem?", "What is the one next step after this call?"],
    default: ["What do I want to learn or leave with?", "Who do I most want to meet or ask?", "What would make this a waste of time?"],
  };
  return { why_it_fits: "", questions: q[i.kind] ?? q.default, intro: "", ask: "" };
}

/** Keeps only what the model said that is safe: numbers must come from the facts, the intro stays short. */
export function cleanPrep(raw: unknown, allowed: string, unsupported: (text: string, allowed: string) => string[]): RadarPrep | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
  const qs = Array.isArray(r.questions) ? r.questions.map((x) => s(x, 160)).filter((x) => x.length > 8).slice(0, 3) : [];
  const intro = s(r.intro, 420);
  const words = intro.split(/\s+/).filter(Boolean).length;
  const body = `${s(r.why_it_fits, 300)} ${qs.join(" ")} ${intro} ${s(r.ask, 160)}`;
  if (!qs.length && !intro) return null;
  const bad = unsupported(body, allowed).length > 0 || /\[[^\]]+\]/.test(body);
  if (bad) return null;
  return { why_it_fits: s(r.why_it_fits, 300), questions: qs, intro: words <= 75 ? intro : "", ask: s(r.ask, 160) };
}
