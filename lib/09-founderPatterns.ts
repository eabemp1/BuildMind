/**
 * lib/founderPatterns.ts
 *
 * Resolves strengths vs avoidance so the same area is never both.
 *
 * A real export listed "content creation" and "direct outreach (email)" as
 * strengths AND "content creation" and "outreach" as avoidance. Cause: one
 * completed task appended a strength, one skipped task appended an avoidance,
 * with no look at the totals. This decides each contested area from the actual
 * completion record, and says "mixed" when the record cannot decide.
 */
import { classifyTask, domainOfLabel, isMeaninglessLabel, sameWorkArea } from "@/lib/taxonomy/taskTaxonomy";

export interface AreaRecord { title: string; completed: boolean }

export interface ResolvedPatterns {
  strengths: string[];
  avoidance: string[];
  /** Areas that appear in both lists and whose record cannot decide which is true. */
  mixed: Array<{ label: string; completed: number; total: number }>;
}

const MIN_TOTAL = 3;
const STRENGTH_AT = 0.6;
const AVOIDANCE_AT = 0.35;

function recordFor(label: string, records: AreaRecord[]): { completed: number; total: number } {
  let completed = 0;
  let total = 0;
  for (const r of records) {
    const c = classifyTask(r.title);
    if (!c.confident) continue;
    if (sameWorkArea(c.displayLabel, label)) {
      total++;
      if (r.completed) completed++;
    }
  }
  return { completed, total };
}

export function resolveStrengthsAndAvoidance(input: {
  strengths: string[];
  avoidance: string[];
  records: AreaRecord[];
  limit?: number;
}): ResolvedPatterns {
  const limit = input.limit ?? 8;
  const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter((x) => x && !isMeaninglessLabel(x)))];
  let strengths = clean(input.strengths);
  let avoidance = clean(input.avoidance);
  const mixed: ResolvedPatterns["mixed"] = [];

  for (const a of [...avoidance]) {
    const clash = strengths.filter((s) => sameWorkArea(s, a));
    if (clash.length === 0) continue;
    const { completed, total } = recordFor(a, input.records);
    const rate = total > 0 ? completed / total : null;
    if (total >= MIN_TOTAL && rate !== null && rate >= STRENGTH_AT) {
      avoidance = avoidance.filter((x) => x !== a);
    } else if (total >= MIN_TOTAL && rate !== null && rate <= AVOIDANCE_AT) {
      strengths = strengths.filter((s) => !clash.includes(s));
    } else {
      avoidance = avoidance.filter((x) => x !== a);
      strengths = strengths.filter((s) => !clash.includes(s));
      mixed.push({ label: domainOfLabel(a) ?? a, completed, total });
    }
  }
  const seen = new Set<string>();
  return {
    strengths: strengths.slice(0, limit),
    avoidance: avoidance.slice(0, limit),
    mixed: mixed.filter((m) => (seen.has(m.label) ? false : (seen.add(m.label), true))),
  };
}
