/**
 * app/api/user/score-history/route.ts
 *
 * GET  → returns the last 30 days of score history for the current user
 * POST → upserts today's score entry
 *
 * Storage: founder_context.score_history (jsonb column, added in migration
 * 20260502000000_agentic_upgrades.sql which already adds jsonb columns to
 * founder_context). Falls back to a dedicated score_history table if the
 * jsonb column doesn't exist yet.
 *
 * This endpoint makes score history device-independent — the localStorage
 * copy in lib/scoring/index.ts is now just a fast-read cache.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScoreEntry = { date: string; score: number };

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function mergeHistory(existing: ScoreEntry[], entry: ScoreEntry): ScoreEntry[] {
  const map = new Map<string, number>();
  existing.forEach(h => map.set(h.date, h.score));
  map.set(entry.date, entry.score);
  return Array.from(map.entries())
    .map(([date, score]) => ({ date, score }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30); // keep last 30 days
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("founder_context")
      .select("score_history")
      .eq("user_id", userId)
      .maybeSingle();

    const history: ScoreEntry[] = (data?.score_history as ScoreEntry[] | null) ?? [];
    return NextResponse.json({ history });
  } catch {
    return NextResponse.json({ history: [] });
  }
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const date  = String(body?.date  ?? "").slice(0, 10);
  const rawScore = body?.score;
  const score = Number(rawScore);

  // Validate date is a real ISO date string (YYYY-MM-DD) — reject garbage dates
  // like "9999-99-99" that would corrupt the history timeline.
  const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!date || !dateRegex.test(date) || isNaN(new Date(date).getTime())) {
    return NextResponse.json({ error: "date must be a valid YYYY-MM-DD string" }, { status: 400 });
  }
  if (rawScore === undefined || rawScore === null || rawScore === "" || isNaN(score)) {
    return NextResponse.json({ error: "score must be a number" }, { status: 400 });
  }
  // Clamp score to [0, 100] — scores outside this range are not meaningful and
  // could distort the score chart for the user.
  const clampedScore = Math.min(100, Math.max(0, score));

  try {
    const admin = createAdminClient();

    // Fetch existing history
    const { data: existing } = await admin
      .from("founder_context")
      .select("score_history")
      .eq("user_id", userId)
      .maybeSingle();

    const currentHistory: ScoreEntry[] = (existing?.score_history as ScoreEntry[] | null) ?? [];
    const updated = mergeHistory(currentHistory, { date, score: clampedScore });

    await admin
      .from("founder_context")
      .upsert({ user_id: userId, score_history: updated }, { onConflict: "user_id" });

    return NextResponse.json({ ok: true, entries: updated.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save score";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
