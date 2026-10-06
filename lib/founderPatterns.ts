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

export interface AreaStat { label: string; completed: number; total: number }

function recordFor(label: string, records: AreaRecord[], stats: AreaStat[] = []): { completed: number; total: number } {
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
  // Reflection titles are sparse. When they cannot speak for this area, fall
  // back to the per-category completion counts the execution signature holds,
  // so the same export never says '0 of 0' beside '14% completion'.
  if (total === 0) {
    for (const s of stats) {
      if (s.total > 0 && sameWorkArea(s.label, label)) { completed += s.completed; total += s.total; }
    }
  }
  return { completed, total };
}

export function resolveStrengthsAndAvoidance(input: {
  strengths: string[];
  avoidance: string[];
  records: AreaRecord[];
  /** Per-category totals from the execution signature, used when records are too thin. */
  stats?: AreaStat[];
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
    const { completed, total } = recordFor(a, input.records, input.stats);
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
  // "content creation" beside "Social posts · LinkedIn" says one thing twice. Keep the specific one.
  strengths = strengths.filter((a) => a.includes("·") || !strengths.some((b) => b !== a && b.includes("·") && sameWorkArea(a, b)));
  const seen = new Set<string>();
  return {
    strengths: strengths.slice(0, limit),
    avoidance: avoidance.slice(0, limit),
    mixed: mixed.filter((m) => (seen.has(m.label) ? false : (seen.add(m.label), true))),
  };
}
