/**
 * /memory — RETIRED as a standalone page.
 *
 * This page ("What BuildMind knows about you") independently queried
 * founder_memory and founder_context and rendered its own version of data
 * that /insights (rendered inside /progress's Patterns tab) already covers
 * mostly overlapping ground for — plus /memory fetched several fields
 * (days_inactive, override_reasons, current_stage, momentum_score) it never
 * actually rendered anywhere, dead reads sitting next to real ones.
 *
 * Every genuinely unique, useful field from this page has been merged into
 * app/insights/page.tsx: cognitive_load ("Today's reported capacity"),
 * consecutive_tasks_completed and days_inactive (added to the at-a-glance
 * stat row), topics_mentioned_repeatedly ("Topics you keep circling"), and
 * archetype_classified_at (now shown under "How you operate"). The lifetime
 * tasks_completed_total counter is also merged in, labeled separately from
 * insights' existing 30-day totalTasksCompleted rather than conflated with
 * it — they're genuinely different metrics (lifetime vs. rolling 30-day),
 * not a bug to merge into one number. override_reasons and current_stage
 * were dropped entirely: override_reasons was dead here and insights already
 * has the real, working equivalent (topOverrideReason, correctly sourced
 * from reflexion_learning_log); current_stage duplicated the stage variable
 * insights already derives from projects.startup_stage, and adding a second
 * source for the same concept is exactly the kind of drift already fixed
 * elsewhere this session (pulse_score/momentum, Cofounder Pulse widget).
 *
 * This mirrors the exact precedent already set by app/weekly-share/page.tsx
 * for the same kind of consolidation — redirect instead of maintaining a
 * second, drifting implementation of the same data.
 */

import { redirect } from "next/navigation";

export default function MemoryPage() {
  redirect("/progress?tab=patterns");
}
