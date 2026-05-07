/**
 * app/api/ai/reflexion-outcome/route.ts
 *
 * Records what the founder did with a recommended action.
 * This is the write end of the learning loop.
 *
 * Called by the frontend when:
 *   - Founder marks today's action as completed
 *   - Founder overrides a task (with optional reason)
 *   - Founder marks as partial
 *
 * After recording, re-derives behavioral patterns and caches them in
 * founder_context.learned_patterns so the next analysis run benefits.
 *
 * POST /api/ai/reflexion-outcome
 * Body: {
 *   log_row_id: string,      — from recordActionShown() return value
 *   outcome: "completed" | "overridden" | "partial",
 *   outcome_note?: string    — required when outcome is "overridden"
 * }
 */

import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import {
  recordActionOutcome,
  markIgnoredAfter24h,
  type ActionOutcome,
} from "@/lib/learning";

export async function POST(request: Request) {
  try {
    const routeUser = await getRouteUser();
    if (!routeUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = routeUser.userId;

    const body = await request.json().catch(() => ({}));
    const logRowId = String(body?.log_row_id ?? "").trim();
    const outcome = String(body?.outcome ?? "") as ActionOutcome;
    const outcomeNote = String(body?.outcome_note ?? "").trim().slice(0, 500) || undefined;

    if (!logRowId) {
      return NextResponse.json({ success: false, error: "log_row_id is required" }, { status: 400 });
    }

    const validOutcomes: ActionOutcome[] = ["completed", "overridden", "partial"];
    if (!validOutcomes.includes(outcome)) {
      return NextResponse.json(
        { success: false, error: `outcome must be one of: ${validOutcomes.join(", ")}` },
        { status: 400 }
      );
    }

    // Mark stale pending rows as ignored (lazy cleanup — no cron needed)
    markIgnoredAfter24h(userId).catch(() => {});

    const success = await recordActionOutcome({
      logRowId,
      userId,
      outcome,
      outcomeNote,
    });

    if (!success) {
      return NextResponse.json(
        { success: false, error: "Failed to record outcome — row not found or unauthorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Outcome recorded: ${outcome}. Learning patterns updated.`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to record outcome";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * GET /api/ai/reflexion-outcome?user_id=...
 * Returns the last 10 log rows for a user (for the iteration history UI).
 */
export async function GET(request: Request) {
  try {
    const routeUser = await getRouteUser();
    if (!routeUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = routeUser.userId;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(20, Math.max(1, Number(searchParams.get("limit") ?? "10")));

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("reflexion_learning_log")
      .select("id,session_id,stage,action_shown,action_type,outcome,viability_score,confidence,created_at,outcome_recorded_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data ?? [],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to fetch log";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
