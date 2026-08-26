import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/server/adminAuth";
import { actionCategoryLabel } from "@/lib/actionClassification";
import { deduplicateTags } from "@/lib/founderMemory";

/**
 * GET/POST /api/admin/reclassify-founder-memory
 *
 * Browser-callable version of scripts/reclassify-founder-memory-from-source.ts.
 *
 * NOT the same fix as /api/admin/cleanup-avoidance-zones (the "Clean up
 * avoidance zones" card above this one). That one re-runs the STORED label
 * through actionCategoryLabel() — it fixes garbled raw-text fragments, but
 * a clean-looking-but-generic stored label like "direct outreach" or "user
 * interviews" comes back unchanged, because the words a more specific
 * pattern would need (e.g. "cold DM", "churned", "case study") were never
 * in that stored string to begin with. This route instead rebuilds
 * avoidance_zones/strengths from the actual source text — reflections.
 * today_action (+ outcome) and tasks.title (+ is_completed) — which is
 * where the real specificity still lives.
 *
 * REPLACES (not appends to) avoidance_zones/strengths per user. Rows are
 * folded in true chronological order through the same accumulate+dedupe
 * (cap 10) logic the live write paths use, so the result matches what the
 * column would contain today if the current classifier had been live from
 * day one.
 *
 * Bucketing mirrors the live rule in app/api/founder-context/task-complete/
 * route.ts EXACTLY: outcome IN ('blocked','skipped') -> avoidance_zones,
 * everything else -> strengths. "abandoned" currently counts as a
 * strength there too — ABANDONED_AS_AVOIDANCE below must stay in sync with
 * that route if that rule ever changes.
 *
 * GET  → dry run: returns what WOULD change, writes nothing.
 * POST → live run: writes the rebuilt arrays back.
 * Optional ?user=<uuid> limits either mode to one account.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ABANDONED_AS_AVOIDANCE = false;

type SourceEvent = { at: number; text: string; bucket: "avoidance" | "strength" };
type ReclassifyRow = {
  user_id: string;
  source_events: number;
  avoidance_zones?: { before: string[]; after: string[] };
  strengths?: { before: string[]; after: string[] };
  writeError?: string;
};

function isAvoidanceOutcome(outcome: string | null): boolean {
  if (outcome === "blocked" || outcome === "skipped") return true;
  if (outcome === "abandoned" && ABANDONED_AS_AVOIDANCE) return true;
  return false;
}

function rebuild(events: SourceEvent[], bucket: "avoidance" | "strength"): string[] {
  const relevant = events.filter((e) => e.bucket === bucket).sort((a, b) => a.at - b.at);
  return deduplicateTags(relevant.map((e) => actionCategoryLabel(e.text)).filter(Boolean), 10);
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function buildEventsForUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<SourceEvent[]> {
  const events: SourceEvent[] = [];

  const { data: reflections } = await admin
    .from("reflections")
    .select("today_action, outcome, created_at")
    .eq("user_id", userId)
    .not("today_action", "is", null);

  for (const r of (reflections as Array<{ today_action: string | null; outcome: string | null; created_at: string | null }>) ?? []) {
    const text = r.today_action?.trim();
    if (!text) continue;
    const at = r.created_at ? new Date(r.created_at).getTime() : 0;
    events.push({ at, text, bucket: isAvoidanceOutcome(r.outcome) ? "avoidance" : "strength" });
  }

  const { data: tasks } = await admin
    .from("tasks")
    .select("title, updated_at, completed_at, created_at")
    .eq("user_id", userId)
    .eq("is_completed", true);

  for (const t of (tasks as Array<{ title: string | null; updated_at: string | null; completed_at: string | null; created_at: string | null }>) ?? []) {
    const text = t.title?.trim();
    if (!text) continue;
    const rawAt = t.completed_at ?? t.updated_at ?? t.created_at;
    const at = rawAt ? new Date(rawAt).getTime() : 0;
    events.push({ at, text, bucket: "strength" });
  }

  return events;
}

async function runReclassify(userIdFilter: string | null, isDryRun: boolean) {
  const admin = createAdminClient();

  let userQuery = admin.from("founder_memory").select("user_id, avoidance_zones, strengths");
  if (userIdFilter) userQuery = userQuery.eq("user_id", userIdFilter);

  const { data: memRows, error } = await userQuery;
  if (error) return { ok: false as const, error: error.message };
  if (!memRows || memRows.length === 0) {
    return { ok: true as const, dryRun: isDryRun, touched: 0, skipped: 0, results: [] as ReclassifyRow[] };
  }

  const results: ReclassifyRow[] = [];
  let touched = 0;
  let skipped = 0;

  for (const row of memRows as Array<{ user_id: string; avoidance_zones: string[] | null; strengths: string[] | null }>) {
    const events = await buildEventsForUser(admin, row.user_id);
    if (events.length === 0) {
      skipped++;
      continue;
    }

    const nextAvoidance = rebuild(events, "avoidance");
    const nextStrengths = rebuild(events, "strength");
    const currentAvoidance = (row.avoidance_zones ?? []).filter(Boolean);
    const currentStrengths = (row.strengths ?? []).filter(Boolean);

    const avoidanceChanged = !arraysEqual(currentAvoidance, nextAvoidance);
    const strengthsChanged = !arraysEqual(currentStrengths, nextStrengths);

    if (!avoidanceChanged && !strengthsChanged) {
      skipped++;
      continue;
    }

    touched++;
    const entry: ReclassifyRow = { user_id: row.user_id, source_events: events.length };
    if (avoidanceChanged) entry.avoidance_zones = { before: currentAvoidance, after: nextAvoidance };
    if (strengthsChanged) entry.strengths = { before: currentStrengths, after: nextStrengths };

    if (!isDryRun) {
      const update: Record<string, string[]> = {};
      if (avoidanceChanged) update.avoidance_zones = nextAvoidance;
      if (strengthsChanged) update.strengths = nextStrengths;
      const { error: updateError } = await admin.from("founder_memory").update(update).eq("user_id", row.user_id);
      if (updateError) entry.writeError = updateError.message;
    }

    results.push(entry);
  }

  return { ok: true as const, dryRun: isDryRun, touched, skipped, results };
}

async function handle(request: Request, isDryRun: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isAdminUser(user.id))) {
    return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userIdFilter = searchParams.get("user");

  const result = await runReclassify(userIdFilter, isDryRun);
  if (!result.ok) return NextResponse.json(result, { status: 500 });
  return NextResponse.json(result);
}

// Dry run — safe to call any time, writes nothing.
export async function GET(request: Request) {
  return handle(request, true);
}

// Live run — replaces avoidance_zones/strengths with the rebuilt arrays.
export async function POST(request: Request) {
  return handle(request, false);
}
