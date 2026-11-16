/**
 * lib/mirrorGate.ts: when Founder Mirror may make claims about how a founder behaves.
 * Same bar as Progress (7 real reflections), and reflections from a test run never count.
 */
import { isTestRun } from "@/lib/testMode";

export const MIRROR_MIN_REFLECTIONS = 7;

export interface MirrorGate {
  gated: boolean;
  realCount: number;
  needed: number;
  reason: "test_run" | "too_few" | null;
}

export function mirrorGate(notes: Array<string | null | undefined>, testMode: boolean): MirrorGate {
  const realCount = notes.filter((n) => !isTestRun(n)).length;
  if (testMode) return { gated: true, realCount, needed: MIRROR_MIN_REFLECTIONS, reason: "test_run" };
  const gated = realCount < MIRROR_MIN_REFLECTIONS;
  return { gated, realCount, needed: MIRROR_MIN_REFLECTIONS, reason: gated ? "too_few" : null };
}
