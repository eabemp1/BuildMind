/**
 * scripts/reclassify-founder-memory-from-source.ts
 *
 * WHY THIS SCRIPT EXISTS (and why cleanup-avoidance-zones.ts doesn't cover it):
 *
 * founder_memory.avoidance_zones / strengths only ever store the DERIVED
 * label — the original task/reflection text is discarded at write time
 * (lib/founderMemory.ts observeTaskEvent(), app/api/founder-context/
 * task-complete/route.ts). When actionCategoryLabel() was expanded from
 * ~8 generic buckets to ~45 specific labels, that only changed what gets
 * written for NEW events. Rows already holding an old generic label like
 * "direct outreach" or "user interviews" are permanently stuck — running
 * actionCategoryLabel("direct outreach") again just returns "direct
 * outreach", because the words that would match a more specific pattern
 * (e.g. "cold DM", "churned", "case study") were never in that string to
 * begin with. Confirmed directly:
 *
 *   actionCategoryLabel("direct outreach")  -> "direct outreach"   (no-op)
 *   actionCategoryLabel("user interviews")  -> "user interviews"   (no-op)
 *
 * cleanup-avoidance-zones.ts re-runs the STORED LABEL through the
 * classifier — it fixes garbled raw-text fragments (a different, earlier
 * bug) but cannot recover specificity that's already gone. This script
 * instead rebuilds both arrays from the two places the real source text
 * still lives:
 *
 *   1. reflections.today_action + reflections.outcome
 *      — the /today check-in flow. This is the PRIMARY source: app/today/
 *        page.tsx sends { taskTitle: actionData.action, outcome:
 *        selectedOutcome } to /api/founder-context/task-complete, and
 *        actionData.action is exactly what gets persisted as
 *        reflections.today_action. Bucketing mirrors that route's live
 *        rule EXACTLY (see JUDGMENT CALL below):
 *          outcome IN ('blocked','skipped') -> avoidance_zones
 *          anything else                    -> strengths
 *
 *   2. tasks.title + tasks.is_completed
 *      — the Project Workspace checkbox flow (lib/buildmind.ts,
 *        lib/queries.ts), which bypasses /today and reflections entirely.
 *        Only contributes to STRENGTHS: is_completed=true is a reliable
 *        durable signal, but there is no durable "skipped" signal on this
 *        table — a task sitting at is_completed=false just means "not done
 *        yet," not "was avoided," and the one-off toggle-back-to-incomplete
 *        event that does write "skipped" (lib/buildmind.ts) isn't recorded
 *        anywhere retrievable after the fact. So this script does not
 *        invent avoidance signal from tasks.
 *
 * JUDGMENT CALL — flagged, not silently decided:
 * The live task-complete route buckets outcome "abandoned" as a STRENGTH
 * (only "blocked"/"skipped" count as avoidance). In plain English
 * "abandoned" reads like avoidance. This script reproduces the CURRENT
 * live rule as-is, so the rebuilt data matches what the app would classify
 * an abandoned task as today — it does not silently redefine that rule.
 * If "abandoned" should count as avoidance, that's a separate, deliberate
 * change to app/api/founder-context/task-complete/route.ts, and this
 * script's ABANDONED_AS_AVOIDANCE flag below should flip alongside it so
 * historical data and live behavior never diverge again.
 *
 * REPLACES (does not append to) avoidance_zones/strengths per user — the
 * whole point is to rebuild from scratch, not patch around old entries.
 * Rows are folded in ascending chronological order through the exact same
 * accumulate+dedupe(cap 10) logic the live code uses, so the result is
 * "what this column would contain today if the current classifier had
 * been in place from day one," not an arbitrarily-ordered rebuild.
 *
 * Run: npx tsx scripts/reclassify-founder-memory-from-source.ts [--dry-run] [--user <uuid>]
 *
 *   --dry-run   Prints before/after per user without writing. Always run
 *               this first, on the full user set, before --user spot
 *               checks or a real run.
 *   --user <id> Limit to one user.
 *   --apply     Actually writes. Without this flag, nothing is written
 *               regardless of --dry-run being present or not (dry-run is
 *               the default; you must opt into writing).
 */

import { createClient } from "@supabase/supabase-js";
import { actionCategoryLabel } from "../lib/actionClassification";
import { deduplicateTags } from "../lib/founderMemory";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const shouldApply = process.argv.includes("--apply");
const userIdArg = (() => {
  const idx = process.argv.indexOf("--user");
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

// See "JUDGMENT CALL" comment above — flip this only alongside the matching
// change in app/api/founder-context/task-complete/route.ts.
const ABANDONED_AS_AVOIDANCE = false;

type SourceEvent = { at: number; text: string; bucket: "avoidance" | "strength" };

function isAvoidanceOutcome(outcome: string | null): boolean {
  if (outcome === "blocked" || outcome === "skipped") return true;
  if (outcome === "abandoned" && ABANDONED_AS_AVOIDANCE) return true;
  return false;
}

// Same fold the live append-on-every-event code effectively performs over
// time: each new label pushed to the end, deduplicated, capped at 10. We
// replay it here in true chronological order instead of arrival order,
// which is what actually determines which labels survive the cap.
function rebuild(events: SourceEvent[], bucket: "avoidance" | "strength"): string[] {
  const relevant = events.filter((e) => e.bucket === bucket).sort((a, b) => a.at - b.at);
  const labels = relevant.map((e) => actionCategoryLabel(e.text)).filter(Boolean);
  return deduplicateTags(labels, 10);
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function fetchAllUserIds(): Promise<string[]> {
  if (userIdArg) return [userIdArg];
  const { data, error } = await supabase.from("founder_memory").select("user_id");
  if (error) {
    console.error("Failed to list users:", error.message);
    process.exit(1);
  }
  return (data ?? []).map((r) => r.user_id as string);
}

async function buildEventsForUser(userId: string): Promise<SourceEvent[]> {
  const events: SourceEvent[] = [];

  const { data: reflections, error: reflError } = await supabase
    .from("reflections")
    .select("today_action, outcome, created_at")
    .eq("user_id", userId)
    .not("today_action", "is", null);
  if (reflError) {
    console.error(`  [${userId}] reflections query failed: ${reflError.message}`);
  } else {
    for (const r of reflections ?? []) {
      const text = (r.today_action as string | null)?.trim();
      if (!text) continue;
      const at = r.created_at ? new Date(r.created_at as string).getTime() : 0;
      events.push({
        at,
        text,
        bucket: isAvoidanceOutcome(r.outcome as string | null) ? "avoidance" : "strength",
      });
    }
  }

  const { data: tasks, error: taskError } = await supabase
    .from("tasks")
    .select("title, is_completed, updated_at, completed_at, created_at")
    .eq("user_id", userId)
    .eq("is_completed", true);
  if (taskError) {
    console.error(`  [${userId}] tasks query failed: ${taskError.message}`);
  } else {
    for (const t of tasks ?? []) {
      const text = (t.title as string | null)?.trim();
      if (!text) continue;
      const rawAt = (t.completed_at as string | null) ?? (t.updated_at as string | null) ?? (t.created_at as string | null);
      const at = rawAt ? new Date(rawAt).getTime() : 0;
      events.push({ at, text, bucket: "strength" });
    }
  }

  return events;
}

async function main() {
  console.log(shouldApply ? "LIVE RUN — rows will be updated.\n" : "DRY RUN — no writes will be made. Pass --apply to write.\n");
  if (ABANDONED_AS_AVOIDANCE) {
    console.log("Note: ABANDONED_AS_AVOIDANCE is true — 'abandoned' reflections will count as avoidance_zones.\n");
  }

  const userIds = await fetchAllUserIds();
  if (userIds.length === 0) {
    console.log("No founder_memory users found.");
    return;
  }

  let touched = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    const events = await buildEventsForUser(userId);
    if (events.length === 0) {
      skipped++;
      continue;
    }

    const nextAvoidance = rebuild(events, "avoidance");
    const nextStrengths = rebuild(events, "strength");

    const { data: memRow, error: memError } = await supabase
      .from("founder_memory")
      .select("avoidance_zones, strengths")
      .eq("user_id", userId)
      .maybeSingle();
    if (memError) {
      console.error(`  [${userId}] founder_memory read failed: ${memError.message}`);
      failed++;
      continue;
    }

    const currentAvoidance = ((memRow?.avoidance_zones as string[] | null) ?? []).filter(Boolean);
    const currentStrengths = ((memRow?.strengths as string[] | null) ?? []).filter(Boolean);

    const avoidanceChanged = !arraysEqual(currentAvoidance, nextAvoidance);
    const strengthsChanged = !arraysEqual(currentStrengths, nextStrengths);

    if (!avoidanceChanged && !strengthsChanged) {
      skipped++;
      continue;
    }

    touched++;
    console.log(`\nuser_id: ${userId} (${events.length} source events)`);
    if (avoidanceChanged) {
      console.log(`  avoidance_zones:`);
      console.log(`    before: ${JSON.stringify(currentAvoidance)}`);
      console.log(`    after:  ${JSON.stringify(nextAvoidance)}`);
    }
    if (strengthsChanged) {
      console.log(`  strengths:`);
      console.log(`    before: ${JSON.stringify(currentStrengths)}`);
      console.log(`    after:  ${JSON.stringify(nextStrengths)}`);
    }

    if (shouldApply) {
      const update: Record<string, string[]> = {};
      if (avoidanceChanged) update.avoidance_zones = nextAvoidance;
      if (strengthsChanged) update.strengths = nextStrengths;
      const { error: updateError } = await supabase
        .from("founder_memory")
        .update(update)
        .eq("user_id", userId);
      if (updateError) {
        console.error(`  FAILED to write: ${updateError.message}`);
        failed++;
        touched--;
      }
    }
  }

  console.log(`\n${touched} user(s) ${shouldApply ? "were" : "would be"} updated, ${skipped} unchanged/no-source-data, ${failed} failed.`);
  if (!shouldApply && touched > 0) {
    console.log("Run again with --apply to write. Use --user <uuid> to spot-check one founder first.");
  }
}

main();
