/**
 * lib/socialAccountability.ts — Layer 7: Social Accountability Layer
 *
 * External pressure without investors or VCs.
 *
 * Features:
 *   1. Behavioral weekly share card (not just stats — names the avoidance zone)
 *   2. Founder pairing — match founders with complementary avoidance zones
 *   3. Public commitment — founder states Monday's task, BuildMind posts the result Friday
 *   4. Streak visibility — opt-in public streak; losing a public streak hits different
 *
 * Data shapes needed in DB (migration at bottom of file):
 *   - founder_pairs (user_a, user_b, paired_at, active)
 *   - public_commitments (user_id, task_title, committed_at, completed, result_posted_at)
 *   - public_streaks (user_id, streak, opt_in, last_updated)
 */

import type { ExecutionSignature, TaskCategory } from "@/lib/outcomeCorrelation";
import type { SignatureCard } from "@/lib/mirrorMoment";

// ── 1. Behavioral share card ──────────────────────────────────────────────────

export interface BehavioralShareCard {
  founderName: string | null;
  weekNumber: number;
  tasksCompleted: number;
  totalTasks: number;
  userConversationsThisWeek: number;
  avoidanceZone: string | null;
  executionScore: number;      // 0–100
  streakCount: number;
  highlightSentence: string;   // the one sentence that makes people share it
  shareText: string;           // ready-to-copy text for X/LinkedIn
  shareUrl: string;            // link to the public share page
}

export function buildBehavioralShareCard(params: {
  founderName: string | null;
  weekNumber: number;
  tasksCompleted: number;
  totalTasks: number;
  userConversationsThisWeek: number;
  avoidanceZone: string | null;
  executionScore: number;
  streakCount: number;
  userId: string;
}): BehavioralShareCard {
  const {
    founderName,
    weekNumber,
    tasksCompleted,
    totalTasks,
    userConversationsThisWeek,
    avoidanceZone,
    executionScore,
    streakCount,
    userId,
  } = params;

  const name = founderName?.split(" ")[0] ?? "Founder";
  const completionRate = totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0;

  // Build the highlight sentence — the one that feels specific and slightly uncomfortable
  let highlightSentence = "";
  if (avoidanceZone && tasksCompleted < totalTasks) {
    highlightSentence = `${name} avoided ${avoidanceZone} tasks ${totalTasks - tasksCompleted} time${totalTasks - tasksCompleted !== 1 ? "s" : ""} this week and completed ${tasksCompleted} user conversation${userConversationsThisWeek !== 1 ? "s" : ""}.`;
  } else if (avoidanceZone) {
    highlightSentence = `${name} completed all ${totalTasks} tasks. Documented avoidance zone: ${avoidanceZone}.`;
  } else if (userConversationsThisWeek === 0) {
    highlightSentence = `${name} completed ${completionRate}% of tasks. User conversations this week: 0.`;
  } else {
    highlightSentence = `${name} completed ${completionRate}% of tasks. Execution score: ${executionScore}.`;
  }

  const shareText = buildShareText({
    name,
    weekNumber,
    tasksCompleted,
    totalTasks,
    avoidanceZone,
    executionScore,
    streakCount,
    highlightSentence,
  });

  return {
    founderName,
    weekNumber,
    tasksCompleted,
    totalTasks,
    userConversationsThisWeek,
    avoidanceZone,
    executionScore,
    streakCount,
    highlightSentence,
    shareText,
    shareUrl: `https://buildmind.app/share/${userId}/week-${weekNumber}`,
  };
}

function buildShareText(params: {
  name: string;
  weekNumber: number;
  tasksCompleted: number;
  totalTasks: number;
  avoidanceZone: string | null;
  executionScore: number;
  streakCount: number;
  highlightSentence: string;
}): string {
  const lines: string[] = [
    `Week ${params.weekNumber} execution report:`,
    params.highlightSentence,
    `Execution score: ${params.executionScore}/100`,
    params.streakCount >= 3 ? `${params.streakCount}-day streak.` : "",
    "",
    `Tracked by @BuildMind`,
  ];
  return lines.filter((l) => l !== undefined).join("\n").trim();
}

// ── 2. Founder pairing ────────────────────────────────────────────────────────

export interface FounderPair {
  founderAId: string;
  founderBId: string;
  founderAAvoidanceZone: TaskCategory | null;
  founderBAvoidanceZone: TaskCategory | null;
  compatibilityReason: string;
}

/**
 * scoreFounderCompatibility — returns a 0–100 match score.
 * Two founders are well-paired when their strengths cover each other's avoidance zones.
 *
 * Best pairing: executor (avoids outreach) + connector (avoids technical)
 * Secondary: executor + content creator / researcher + executor
 */
export function scoreFounderCompatibility(
  sigA: ExecutionSignature,
  sigB: ExecutionSignature,
): number {
  let score = 0;

  const avoidA = sigA.avoidanceZones.map((z) => z.category);
  const strengthA = sigA.strengths.map((s) => s.category);
  const avoidB = sigB.avoidanceZones.map((z) => z.category);
  const strengthB = sigB.strengths.map((s) => s.category);

  // Cross-coverage: A's strength covers B's avoidance
  for (const cat of strengthA) {
    if (avoidB.includes(cat)) score += 25;
  }
  // B's strength covers A's avoidance
  for (const cat of strengthB) {
    if (avoidA.includes(cat)) score += 25;
  }
  // Avoid pairing two founders with the same avoidance zone (echo chamber)
  const sharedAvoidance = avoidA.filter((c) => avoidB.includes(c));
  score -= sharedAvoidance.length * 15;

  return Math.max(0, Math.min(100, score));
}

/**
 * buildPairingReason — human-readable explanation of why two founders are paired.
 */
export function buildPairingReason(
  sigA: ExecutionSignature,
  sigB: ExecutionSignature,
  nameA: string,
  nameB: string,
): string {
  const avoidA = sigA.avoidanceZones[0]?.category;
  const strengthA = sigA.strengths[0]?.category;
  const avoidB = sigB.avoidanceZones[0]?.category;
  const strengthB = sigB.strengths[0]?.category;

  if (strengthA && avoidB && strengthA === avoidB) {
    return `${nameA} executes ${strengthA} tasks that ${nameB} avoids. ${nameB} executes ${strengthB ?? "other"} tasks that ${nameA} avoids. You cover each other's blind spots.`;
  }
  return `${nameA} and ${nameB} have complementary execution patterns. Reviewing each other's weekly card creates accountability in both directions.`;
}

// ── 3. Public commitment ──────────────────────────────────────────────────────

export interface PublicCommitment {
  userId: string;
  founderName: string | null;
  taskTitle: string;
  committedAt: string;    // ISO — Monday
  deadline: string;       // ISO — Friday
  completed: boolean | null;
  resultPostedAt: string | null;
  publicText: string;     // what BuildMind posts on Monday
  resultText: string | null; // what BuildMind posts on Friday
}

export function buildCommitmentPublicText(
  founderName: string | null,
  taskTitle: string,
  committedAt: string,
): string {
  const name = founderName?.split(" ")[0] ?? "A founder";
  return `${name} committed to: "${taskTitle}" this week. Result posts Friday. — BuildMind`;
}

export function buildCommitmentResultText(
  founderName: string | null,
  taskTitle: string,
  completed: boolean,
): string {
  const name = founderName?.split(" ")[0] ?? "A founder";
  if (completed) {
    return `${name} delivered: "${taskTitle}" ✓ — BuildMind`;
  }
  return `${name} committed to "${taskTitle}" this week. Not completed. Accountability on record. — BuildMind`;
}

/**
 * isCommitmentWindowOpen — returns true between Monday 00:00 and Monday 23:59 UTC.
 * Commitments are only accepted on Mondays to preserve weekly cadence.
 */
export function isCommitmentWindowOpen(now = new Date()): boolean {
  return now.getUTCDay() === 1;
}

/**
 * isResultPostingTime — returns true on Friday after 18:00 UTC.
 */
export function isResultPostingTime(now = new Date()): boolean {
  return now.getUTCDay() === 5 && now.getUTCHours() >= 18;
}

// ── 4. Streak visibility ──────────────────────────────────────────────────────

export interface PublicStreak {
  userId: string;
  founderName: string | null;
  streak: number;
  optIn: boolean;
  lastUpdated: string;
}

export function buildStreakLossMessage(
  founderName: string | null,
  previousStreak: number,
): string {
  const name = founderName?.split(" ")[0] ?? "A founder";
  return `${name}'s ${previousStreak}-day streak ended. — BuildMind`;
}

/**
 * streakLossPublicImpact — losing a public streak you know others can see
 * is categorically different from losing a private one.
 * This function returns a reminder shown to the founder when their streak
 * is at risk and their streak is public.
 */
export function buildPublicStreakAtRiskMessage(
  founderName: string | null,
  streak: number,
): string {
  const name = founderName?.split(" ")[0] ?? "You";
  return `${name}, your ${streak}-day streak is visible to your accountability partner and BuildMind community. Complete today's task to keep it alive.`;
}

// ── DB migration hint (Supabase SQL) ─────────────────────────────────────────
/**
 * Run this migration in Supabase SQL editor to add Layer 7 tables.
 *
 * ```sql
 * -- Founder pairs
 * CREATE TABLE IF NOT EXISTS founder_pairs (
 *   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_a uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 *   user_b uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 *   compatibility_score integer DEFAULT 0,
 *   pairing_reason text,
 *   paired_at timestamptz DEFAULT now(),
 *   active boolean DEFAULT true,
 *   UNIQUE(user_a, user_b)
 * );
 * ALTER TABLE founder_pairs ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Users can see their own pairs"
 *   ON founder_pairs FOR SELECT
 *   USING (auth.uid() = user_a OR auth.uid() = user_b);
 *
 * -- Public commitments
 * CREATE TABLE IF NOT EXISTS public_commitments (
 *   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 *   task_title text NOT NULL,
 *   committed_at timestamptz DEFAULT now(),
 *   deadline timestamptz,
 *   completed boolean,
 *   result_posted_at timestamptz,
 *   public_text text,
 *   result_text text
 * );
 * ALTER TABLE public_commitments ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Users manage their own commitments"
 *   ON public_commitments FOR ALL USING (auth.uid() = user_id);
 *
 * -- Public streaks
 * CREATE TABLE IF NOT EXISTS public_streaks (
 *   user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 *   streak integer DEFAULT 0,
 *   opt_in boolean DEFAULT false,
 *   last_updated timestamptz DEFAULT now()
 * );
 * ALTER TABLE public_streaks ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Anyone can see opted-in streaks"
 *   ON public_streaks FOR SELECT USING (opt_in = true);
 * CREATE POLICY "Users manage their own streak visibility"
 *   ON public_streaks FOR ALL USING (auth.uid() = user_id);
 * ```
 */
export const LAYER_7_MIGRATION_HINT = "See SQL comment above for Supabase migration.";
