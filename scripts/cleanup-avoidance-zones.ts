/**
 * scripts/cleanup-avoidance-zones.ts
 *
 * ONE-TIME CLEANUP for founder_memory.avoidance_zones / strengths rows that
 * still contain the raw-truncated task-title fragments written before the
 * fix in app/api/founder-context/task-complete/route.ts (the one that used
 * to do `String(taskTitle).slice(0, 80)` instead of `actionCategoryLabel()`).
 *
 * That fix stops NEW garbled entries from being written and cleans things
 * up organically over time (deduplicateTags() runs on every subsequent
 * write), but it does nothing for rows that already have garbled fragments
 * sitting in them right now with no future write scheduled to clean them —
 * this script re-processes every existing row through the same
 * actionCategoryLabel() + deduplicateTags() pipeline, once, directly.
 *
 * Run: npx tsx scripts/cleanup-avoidance-zones.ts [--dry-run] [--user <uuid>]
 *
 *   --dry-run   Prints what would change without writing anything. Always
 *               run this first.
 *   --user <id> Limit to one user, for spot-checking before a full run.
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

const isDryRun = process.argv.includes("--dry-run");
const userIdArg = (() => {
  const idx = process.argv.indexOf("--user");
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

// A raw fragment looks like a sentence (spaces, often 40+ chars, frequently
// cut off mid-word with no trailing punctuation). A genuine category label
// from actionCategoryLabel() is short — "direct outreach (email)",
// "content creation", "building/shipping" — so re-running a clean label
// back through actionCategoryLabel() is idempotent and harmless either way.
function cleanArray(raw: unknown): { changed: boolean; before: string[]; after: string[] } {
  const before = Array.isArray(raw) ? (raw as string[]).filter(Boolean) : [];
  if (before.length === 0) return { changed: false, before, after: [] };

  const recategorized = before.map((entry) => actionCategoryLabel(entry));
  const after = deduplicateTags(recategorized);

  const changed = before.length !== after.length || before.some((v, i) => v !== after[i]);
  return { changed, before, after };
}

async function main() {
  console.log(isDryRun ? "DRY RUN — no writes will be made.\n" : "LIVE RUN — rows will be updated.\n");

  let query = supabase.from("founder_memory").select("user_id, avoidance_zones, strengths");
  if (userIdArg) query = query.eq("user_id", userIdArg);

  const { data: rows, error } = await query;
  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.log("No founder_memory rows found.");
    return;
  }

  let touched = 0;
  let skipped = 0;

  for (const row of rows) {
    const avoidance = cleanArray(row.avoidance_zones);
    const strengths = cleanArray(row.strengths);

    if (!avoidance.changed && !strengths.changed) {
      skipped++;
      continue;
    }

    touched++;
    console.log(`\nuser_id: ${row.user_id}`);
    if (avoidance.changed) {
      console.log(`  avoidance_zones:`);
      console.log(`    before: ${JSON.stringify(avoidance.before)}`);
      console.log(`    after:  ${JSON.stringify(avoidance.after)}`);
    }
    if (strengths.changed) {
      console.log(`  strengths:`);
      console.log(`    before: ${JSON.stringify(strengths.before)}`);
      console.log(`    after:  ${JSON.stringify(strengths.after)}`);
    }

    if (!isDryRun) {
      const update: Record<string, string[]> = {};
      if (avoidance.changed) update.avoidance_zones = avoidance.after;
      if (strengths.changed) update.strengths = strengths.after;
      const { error: updateError } = await supabase
        .from("founder_memory")
        .update(update)
        .eq("user_id", row.user_id);
      if (updateError) {
        console.error(`  FAILED to write: ${updateError.message}`);
      }
    }
  }

  console.log(`\n${touched} row(s) ${isDryRun ? "would be" : "were"} updated, ${skipped} already clean.`);
  if (isDryRun && touched > 0) {
    console.log("Run again without --dry-run to apply.");
  }
}

main();
