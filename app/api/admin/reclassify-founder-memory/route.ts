import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/server/adminAuth";
import { reclassifyAll } from "@/lib/server/founderMemoryMaintenance";

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
 * This now also runs automatically (daily cron + self-heal on load); see
 * lib/server/founderMemoryMaintenance.ts. These buttons remain for spot checks.
 *
 * GET  → dry run: returns what WOULD change, writes nothing.
 * POST → live run: writes the rebuilt arrays back.
 * Optional ?user=<uuid> limits either mode to one account.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request, dryRun: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isAdminUser(user.id))) {
    return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }
  const userId = new URL(request.url).searchParams.get("user");
  const result = await reclassifyAll(createAdminClient(), { userId, dryRun });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

// Dry run — safe to call any time, writes nothing.
export async function GET(request: Request) { return handle(request, true); }

// Live run — replaces avoidance_zones/strengths with the rebuilt arrays.
export async function POST(request: Request) { return handle(request, false); }
