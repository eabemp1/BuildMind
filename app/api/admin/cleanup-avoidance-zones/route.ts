import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/server/adminAuth";
import { actionCategoryLabel } from "@/lib/actionClassification";
import { deduplicateTags } from "@/lib/founderMemory";

/**
 * GET/POST /api/admin/cleanup-avoidance-zones
 *
 * Browser-callable version of scripts/cleanup-avoidance-zones.ts — same
 * logic, same actionCategoryLabel()/deduplicateTags() pipeline, but
 * runnable from a deployed URL instead of a local `npx tsx` invocation.
 * No terminal, no env vars to export by hand — auth comes from your
 * existing logged-in admin session, and the service-role write uses the
 * server's own SUPABASE_SERVICE_ROLE_KEY (already configured in Vercel).
 *
 * Cleans BOTH founder_memory.avoidance_zones/strengths AND the separate
 * founder_context.avoidance_zones column (fed by a weekly edge-function
 * synthesis job that was silently failing on a stale column name until
 * this session — now fixed, so it needs the same safety net).
 *
 * GET  → dry run: returns what WOULD change, writes nothing.
 * POST → live run: writes the cleaned arrays back.
 *
 * Optional query param ?user=<uuid> limits either mode to one account —
 * handy for spot-checking one of your test accounts before running it
 * against everyone.
 */

type CleanResult = { changed: boolean; before: string[]; after: string[] };

function cleanArray(raw: unknown): CleanResult {
  const before = Array.isArray(raw) ? (raw as string[]).filter(Boolean) : [];
  if (before.length === 0) return { changed: false, before, after: [] };

  const recategorized = before.map((entry) => actionCategoryLabel(entry));
  const after = deduplicateTags(recategorized);

  const changed = before.length !== after.length || before.some((v, i) => v !== after[i]);
  return { changed, before, after };
}

async function runCleanup(userIdFilter: string | null, isDryRun: boolean) {
  const admin = createAdminClient();

  let query = admin.from("founder_memory").select("user_id, avoidance_zones, strengths");
  if (userIdFilter) query = query.eq("user_id", userIdFilter);

  const { data: rows, error } = await query;
  if (error) {
    return { ok: false as const, error: error.message };
  }
  if (!rows || rows.length === 0) {
    return { ok: true as const, dryRun: isDryRun, touched: 0, skipped: 0, results: [] };
  }

  const results: Array<{
    user_id: string;
    avoidance_zones?: { before: string[]; after: string[] };
    strengths?: { before: string[]; after: string[] };
  }> = [];
  let touched = 0;
  let skipped = 0;

  for (const row of rows) {
    const avoidance = cleanArray((row as { avoidance_zones: unknown }).avoidance_zones);
    const strengths = cleanArray((row as { strengths: unknown }).strengths);

    if (!avoidance.changed && !strengths.changed) {
      skipped++;
      continue;
    }

    touched++;
    const entry: (typeof results)[number] = { user_id: (row as { user_id: string }).user_id };
    if (avoidance.changed) entry.avoidance_zones = { before: avoidance.before, after: avoidance.after };
    if (strengths.changed) entry.strengths = { before: strengths.before, after: strengths.after };
    results.push(entry);

    if (!isDryRun) {
      const update: Record<string, string[]> = {};
      if (avoidance.changed) update.avoidance_zones = avoidance.after;
      if (strengths.changed) update.strengths = strengths.after;
      const { error: updateError } = await admin
        .from("founder_memory")
        .update(update)
        .eq("user_id", (row as { user_id: string }).user_id);
      if (updateError) {
        (entry as Record<string, unknown>).writeError = updateError.message;
      }
    }
  }

  return { ok: true as const, dryRun: isDryRun, touched, skipped, results };
}

async function runFounderContextCleanup(userIdFilter: string | null, isDryRun: boolean) {
  const admin = createAdminClient();

  let query = admin.from("founder_context").select("user_id, avoidance_zones");
  if (userIdFilter) query = query.eq("user_id", userIdFilter);

  const { data: rows, error } = await query;
  if (error) {
    return { ok: false as const, error: error.message };
  }
  if (!rows || rows.length === 0) {
    return { ok: true as const, dryRun: isDryRun, touched: 0, skipped: 0, results: [] };
  }

  const results: Array<{ user_id: string; avoidance_zones: { before: string[]; after: string[] } }> = [];
  let touched = 0;
  let skipped = 0;

  for (const row of rows) {
    const avoidance = cleanArray((row as { avoidance_zones: unknown }).avoidance_zones);
    if (!avoidance.changed) {
      skipped++;
      continue;
    }
    touched++;
    const entry = { user_id: (row as { user_id: string }).user_id, avoidance_zones: { before: avoidance.before, after: avoidance.after } };
    results.push(entry);

    if (!isDryRun) {
      const { error: updateError } = await admin
        .from("founder_context")
        .update({ avoidance_zones: avoidance.after })
        .eq("user_id", (row as { user_id: string }).user_id);
      if (updateError) {
        (entry as Record<string, unknown>).writeError = updateError.message;
      }
    }
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

  const founderMemoryResult = await runCleanup(userIdFilter, isDryRun);
  const founderContextResult = await runFounderContextCleanup(userIdFilter, isDryRun);

  if (!founderMemoryResult.ok) {
    return NextResponse.json(founderMemoryResult, { status: 500 });
  }
  if (!founderContextResult.ok) {
    return NextResponse.json(founderContextResult, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    dryRun: isDryRun,
    founder_memory: founderMemoryResult,
    founder_context: founderContextResult,
  });
}

// Dry run — safe to call any time, writes nothing.
export async function GET(request: Request) {
  return handle(request, true);
}

// Live run — writes cleaned arrays back to founder_memory.
export async function POST(request: Request) {
  return handle(request, false);
}
