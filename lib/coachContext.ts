/**
 * lib/coachContext.ts
 *
 * Assembles a rich behavioral context block for the AI Coach prompt.
 * Called before every coach response. Pulls live data from 6 tables
 * that the coach previously never saw, turning the prompt from
 * "structured project fields" into "I know how this founder actually works."
 *
 * Returns a single formatted string ready to inject into the system prompt.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatRegionalContextBlock } from "@/lib/regionalContext";

export interface CoachBehavioralContext {
  /** The full formatted string for the system prompt */
  contextBlock: string;
  /** Structured fields for confidence scoring */
  signals: {
    hasRecentReflections: boolean;
    hasCompletionPattern: boolean;
    hasMomentumData:      boolean;
    hasSkipReasons:       boolean;
    hasBlockerInsight:    boolean;
    hasMemoryData:        boolean;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n: number, d: number): string {
  if (d === 0) return "0%";
  return `${Math.round((n / d) * 100)}%`;
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  return `${Math.floor(days / 7)} weeks ago`;
}

function truncate(s: string, max = 120): string {
  return s.length > max ? s.slice(0, max).trimEnd() + "…" : s;
}

// ── Main assembler ────────────────────────────────────────────────────────────

export async function assembleCoachContext(
  supabase: SupabaseClient,
  userId:    string,
  projectId: string,
): Promise<CoachBehavioralContext> {

  const signals = {
    hasRecentReflections: false,
    hasCompletionPattern: false,
    hasMomentumData:      false,
    hasSkipReasons:       false,
    hasBlockerInsight:    false,
    hasMemoryData:        false,
  };

  const sections: string[] = [];

  // ── 1. Recent reflections (last 5) ────────────────────────────────────────
  // The single highest-value missing data source. Contains what_tried,
  // what_happened, what_learned, blocker — the founder's own words about
  // what's working and what isn't.
  try {
    const { data: reflections } = await supabase
      .from("reflections")
      .select("outcome, confidence, blocker, blocker_category, what_tried, what_happened, what_learned, note, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (reflections?.length) {
      signals.hasRecentReflections = true;
      const lines: string[] = [];

      for (const r of reflections) {
        const when = relativeDate(r.created_at);
        const conf = r.confidence ? ` (confidence: ${r.confidence}/5)` : "";
        const blocker = r.blocker_category ? ` | blocker: ${r.blocker_category}` : r.blocker ? ` | blocker: ${r.blocker}` : "";
        lines.push(`[${when}] outcome: ${r.outcome}${conf}${blocker}`);
        if (r.what_tried)    lines.push(`  tried: ${truncate(r.what_tried)}`);
        if (r.what_happened) lines.push(`  happened: ${truncate(r.what_happened)}`);
        if (r.what_learned)  lines.push(`  learned: ${truncate(r.what_learned)}`);
        if (r.note && !r.what_tried) lines.push(`  note: ${truncate(r.note)}`);
      }

      sections.push(`RECENT REFLECTIONS (founder's own words — highest signal):\n${lines.join("\n")}`);
    }
  } catch { /* non-fatal */ }

  // ── 2. Action completion pattern (last 30 days) ───────────────────────────
  // Shows what categories this founder actually ships vs avoids.
  // This is what lets the coach say "you complete outreach at 32% but skip
  // content at 80% — don't recommend content here."
  try {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: actions } = await supabase
      .from("reflexion_learning_log")
      .select("action_type, outcome, action_shown, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(60);

    if (actions?.length) {
      signals.hasCompletionPattern = true;

      // Aggregate by action_type
      const byType: Record<string, { completed: number; skipped: number; total: number; lastAction?: string }> = {};
      for (const a of actions) {
        const t = a.action_type ?? "uncategorized";
        if (!byType[t]) byType[t] = { completed: 0, skipped: 0, total: 0 };
        byType[t].total++;
        if (["completed", "partial"].includes(a.outcome))  byType[t].completed++;
        if (["skipped", "ignored", "overridden"].includes(a.outcome)) byType[t].skipped++;
        if (!byType[t].lastAction && a.action_shown) byType[t].lastAction = a.action_shown;
      }

      const total = actions.length;
      const completed = actions.filter(a => ["completed", "partial"].includes(a.outcome)).length;
      const lines = [`Overall: ${completed}/${total} completed (${pct(completed, total)}) in the last 30 days`];

      // Sort by volume, show highest-signal types
      const sorted = Object.entries(byType).sort((a, b) => b[1].total - a[1].total);
      for (const [type, stats] of sorted) {
        if (stats.total < 2) continue;
        const rate = pct(stats.completed, stats.total);
        const signal = stats.completed / stats.total >= 0.5 ? "✓ follows through" : "✗ mostly skips";
        lines.push(`  ${type}: ${rate} completion (${stats.completed}/${stats.total}) — ${signal}`);
      }

      // Most recent 3 actions
      const recent = actions.slice(0, 3);
      const recentLines = recent.map(a =>
        `  [${relativeDate(a.created_at)}] ${a.action_type}: ${a.outcome}${a.action_shown ? ` — "${truncate(a.action_shown, 60)}"` : ""}`
      );
      if (recentLines.length) lines.push(`Most recent actions:\n${recentLines.join("\n")}`);

      sections.push(`EXECUTION PATTERN (30 days):\n${lines.join("\n")}`);
    }
  } catch { /* non-fatal */ }

  // ── 3. Momentum — streak, days inactive, score trend ─────────────────────
  try {
    const { data: ctx } = await supabase
      .from("founder_context")
      .select("momentum_score, streak, days_inactive, last_checkin_date, tasks_completed_today, tasks_completed_total, tasks_accepted_this_week, tasks_overridden_this_week, override_reasons, avoidance_zones, topics_mentioned_repeatedly")
      .eq("user_id", userId)
      .maybeSingle();

    if (ctx) {
      signals.hasMomentumData = true;
      const lines: string[] = [];

      if (ctx.streak)           lines.push(`Current streak: ${ctx.streak} days`);
      if (ctx.days_inactive)    lines.push(`Days since last check-in: ${ctx.days_inactive}`);
      if (ctx.momentum_score)   lines.push(`Momentum score: ${ctx.momentum_score}/100`);
      if (ctx.last_checkin_date) lines.push(`Last active: ${relativeDate(ctx.last_checkin_date)}`);
      if (ctx.tasks_completed_today) lines.push(`Completed today: ${ctx.tasks_completed_today}`);
      if (ctx.tasks_accepted_this_week || ctx.tasks_overridden_this_week) {
        lines.push(`This week: ${ctx.tasks_accepted_this_week ?? 0} accepted, ${ctx.tasks_overridden_this_week ?? 0} overridden`);
      }
      if (Array.isArray(ctx.override_reasons) && ctx.override_reasons.length) {
        lines.push(`Stated override reasons: ${(ctx.override_reasons as string[]).slice(-3).join("; ")}`);
      }
      if (Array.isArray(ctx.avoidance_zones) && ctx.avoidance_zones.length) {
        lines.push(`Avoidance signals (live): ${(ctx.avoidance_zones as string[]).join(", ")}`);
      }
      if (Array.isArray(ctx.topics_mentioned_repeatedly) && ctx.topics_mentioned_repeatedly.length) {
        lines.push(`Topics mentioned repeatedly without action: ${(ctx.topics_mentioned_repeatedly as string[]).join(", ")}`);
      }

      if (lines.length) sections.push(`MOMENTUM & RHYTHM:\n${lines.join("\n")}`);
    }
  } catch { /* non-fatal */ }

  // ── 4. Skip reasons from task_overrides ───────────────────────────────────
  // Explicit reasons the founder gave for not doing something.
  // Much higher signal than inferred avoidance.
  try {
    const { data: overrides } = await supabase
      .from("task_overrides")
      .select("reason, task_text, stage, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8);

    if (overrides?.length) {
      signals.hasSkipReasons = true;
      const lines = overrides.map(o =>
        `[${relativeDate(o.created_at)}] skipped "${truncate(o.task_text ?? "", 60)}" — reason: ${o.reason ?? "none given"}`
      );
      sections.push(`EXPLICIT SKIP REASONS (founder's own words for not doing a task):\n${lines.join("\n")}`);
    }
  } catch { /* non-fatal */ }

  // ── 5. Active blocker insight ─────────────────────────────────────────────
  try {
    const { data: insight } = await supabase
      .from("blocker_insights")
      .select("blocker_category, title, body, action_redirect, surfaced_at")
      .eq("user_id", userId)
      .eq("dismissed", false)
      .order("surfaced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (insight) {
      signals.hasBlockerInsight = true;
      sections.push(`ACTIVE BLOCKER INSIGHT (surfaced ${relativeDate(insight.surfaced_at)}):\n"${insight.title}"\n${truncate(insight.body, 200)}\nRedirect suggested: ${insight.action_redirect ?? "none"}`);
    }
  } catch { /* non-fatal */ }

  // ── 6. Execution scorecard trend ─────────────────────────────────────────
  try {
    const { data: scores } = await supabase
      .from("score_history")
      .select("score, recorded_at")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false })
      .limit(4);

    if (scores?.length && scores.length >= 2) {
      const trend = scores[0].score - scores[scores.length - 1].score;
      const direction = trend > 5 ? "↑ improving" : trend < -5 ? "↓ declining" : "→ stable";
      sections.push(`EXECUTION SCORE TREND: ${scores[0].score}/100 (${direction}, was ${scores[scores.length - 1].score} ${relativeDate(scores[scores.length - 1].recorded_at)})`);
    }
  } catch { /* non-fatal */ }

  // ── 7. Cross-check: what is founder_memory missing ────────────────────────
  // If memory fields are empty, say so explicitly so the coach doesn't
  // hallucinate patterns from empty arrays. Honesty > false confidence.
  try {
    const { data: memory } = await supabase
      .from("founder_memory")
      .select("personality_tags, avoidance_zones, strengths, last_insight, decision_patterns")
      .eq("user_id", userId)
      .maybeSingle();

    if (memory) {
      signals.hasMemoryData = true;
      const memLines: string[] = [];

      if (memory.personality_tags?.length)
        memLines.push(`Personality signals: ${(memory.personality_tags as string[]).join(", ")}`);
      else
        memLines.push("Personality signals: not yet established (founder is early in the system)");

      if (memory.avoidance_zones?.length)
        memLines.push(`Observed avoidance: ${(memory.avoidance_zones as string[]).join(", ")}`);

      if (memory.strengths?.length)
        memLines.push(`Observed strengths: ${(memory.strengths as string[]).join(", ")}`);

      if (memory.last_insight)
        memLines.push(`Last pattern observed by system: "${truncate(memory.last_insight, 150)}"`);

      if (memory.decision_patterns?.length) {
        const top = (memory.decision_patterns as Array<{ pattern: string; count: number }>)
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)
          .map(p => `${p.pattern} (×${p.count})`);
        memLines.push(`Top decision patterns: ${top.join(", ")}`);
      }

      if (memLines.length) sections.push(`FOUNDER MEMORY (system-observed over time):\n${memLines.join("\n")}`);
    }
  } catch { /* non-fatal */ }

  // ── 7. Regional context (Founder Context Engine) ──────────────────────────
  // Single parameterized lookup, not a separate "regional mode" — see
  // lib/regionalContext.ts for the design rationale.
  try {
    const { data: fc } = await supabase
      .from("founder_context")
      .select("country")
      .eq("user_id", userId)
      .maybeSingle();

    const regionalBlock = formatRegionalContextBlock(fc?.country ?? null);
    if (regionalBlock) sections.push(regionalBlock);
  } catch { /* non-fatal */ }

  // ── Assemble ──────────────────────────────────────────────────────────────

  const contextBlock = sections.length
    ? "\n\n" + sections.join("\n\n")
    : "\n\n[Behavioral context not yet available — this founder may be new to the system.]";

  return { contextBlock, signals };
}

// ── Confidence score from assembled signals ───────────────────────────────────

export function computeContextConfidence(signals: CoachBehavioralContext["signals"]): number {
  const weights: Record<keyof typeof signals, number> = {
    hasRecentReflections: 0.30,
    hasCompletionPattern: 0.25,
    hasMomentumData:      0.20,
    hasSkipReasons:       0.10,
    hasBlockerInsight:    0.08,
    hasMemoryData:        0.07,
  };
  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (signals[key as keyof typeof signals]) score += weight;
  }
  return Math.round(score * 100) / 100;
}
