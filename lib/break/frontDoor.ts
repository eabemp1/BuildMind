/**
 * lib/break/frontDoor.ts — the public stress test's front door.
 *
 * Pure. Anyone can type an idea and get the instant, no-AI preview. The live analysis (search plus a model call)
 * is for signed-in people, because it spends real search and AI credit. Set BREAK_PUBLIC_LIVE=open to reopen it to everyone.
 */
export const liveAllowedFor = (signedIn: boolean, env: string | undefined): boolean => signedIn || env === "open";

/** What /break remembers so the first daily action starts from the stress test's own advice. */
export interface BreakSeed { idea: string; advice: string; savedAt: string }
export const BREAK_SEED_KEY = "bm_break_seed";
export const SEED_MAX_AGE_DAYS = 14;

export function makeSeed(idea: string, advice: string, now: Date = new Date()): BreakSeed | null {
  const a = advice.replace(/\s+/g, " ").trim();
  if (!a) return null;
  return { idea: idea.replace(/\s+/g, " ").trim().slice(0, 200), advice: a.slice(0, 280), savedAt: now.toISOString() };
}

export function seedIsFresh(seed: BreakSeed | null | undefined, now: Date = new Date()): seed is BreakSeed {
  if (!seed || typeof seed.advice !== "string" || !seed.advice) return false;
  const at = Date.parse(seed.savedAt);
  return Number.isFinite(at) && now.getTime() - at < SEED_MAX_AGE_DAYS * 86_400_000;
}
