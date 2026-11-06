/**
 * lib/today/draftLine.ts — the Today button's label, which says whether BuildMind has already drafted something.
 * Pure. Reads only a saved draft's shape; it never writes and never calls a model.
 */
export const DRAFT_CAN = "BuildMind can draft this for you";

export interface DraftShape { degraded?: boolean; variants?: unknown[]; sections?: unknown[] }

export function draftLabel(p: DraftShape | null | undefined): string {
  if (!p || p.degraded) return DRAFT_CAN;
  const n = Array.isArray(p.variants) ? p.variants.length : 0;
  if (n > 1) return `BuildMind drafted ${n} versions. Open them`;
  if (n === 1 || (Array.isArray(p.sections) && p.sections.length > 0)) return "BuildMind drafted this. Open it";
  return DRAFT_CAN;
}
