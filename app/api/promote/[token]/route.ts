import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const MISSIONS = [
  { key: "twitter_post", title: "Post on X/Twitter", points: 10 },
  { key: "linkedin_post", title: "Post on LinkedIn", points: 10 },
  { key: "whatsapp_share", title: "Share in a WhatsApp group", points: 8 },
  { key: "reply_thread", title: "Reply to someone building in public", points: 6 },
  { key: "direct_outreach", title: "Tell someone directly (DM/text)", points: 12 },
  { key: "checkin", title: "Weekly check-in", points: 5 },
] as const;

async function resolvePromoter(token: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("promoters")
    .select("id, name, created_at")
    .eq("access_token", token)
    .maybeSingle();
  return data;
}

/**
 * Bounded momentum score — same EMA-style philosophy as BuildMind's own
 * founder momentum score (see lib/scorecard.ts): recent activity counts
 * more than old activity, and it decays gently on inactive days rather than
 * cliff-dropping to zero. Framed positively — this deliberately is NOT a
 * punitive "penalty" system; a friend doing you a favor for free doesn't
 * need to feel shamed by a dashboard. It just quietly reflects real effort.
 */
function computeMomentum(activity: { completed_at: string }[]): number {
  if (!activity.length) return 0;
  const now = Date.now();
  let score = 0;
  for (const a of activity) {
    const daysAgo = (now - new Date(a.completed_at).getTime()) / 86_400_000;
    // Exponential decay — an action today counts fully, a week ago counts ~40%, a month ago ~5%.
    const weight = Math.exp(-daysAgo / 8);
    score += weight * 14;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function computeStreak(activity: { completed_at: string }[]): number {
  const days = new Set(activity.map(a => a.completed_at.slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (days.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (streak === 0 && key === new Date().toISOString().slice(0, 10)) {
      // today not logged yet — don't break streak on the current day
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const promoter = await resolvePromoter(token);
  if (!promoter) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: activity } = await admin
    .from("promoter_activity")
    .select("mission_key, note, completed_at")
    .eq("promoter_id", promoter.id)
    .order("completed_at", { ascending: false })
    .limit(200);

  const rows = activity ?? [];
  const momentum = computeMomentum(rows);
  const streak = computeStreak(rows);
  const activeDays = [...new Set(rows.map(r => r.completed_at.slice(0, 10)))];

  // Completion rate: missions completed at least once / total missions
  const completedKeys = new Set(rows.map(r => r.mission_key));
  const completionRate = Math.round((completedKeys.size / MISSIONS.length) * 100);

  // Last 14 days activity count, for the sparkline
  const dailyCounts: number[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dailyCounts.push(rows.filter(r => r.completed_at.slice(0, 10) === key).length);
  }

  return NextResponse.json({
    ok: true,
    promoter: { name: promoter.name, since: promoter.created_at },
    missions: MISSIONS,
    completedKeys: [...completedKeys],
    activity: rows.slice(0, 30),
    stats: { momentum, streak, completionRate, activeDays, dailyCounts, totalLogged: rows.length },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const promoter = await resolvePromoter(token);
  if (!promoter) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const missionKey = typeof body?.missionKey === "string" ? body.missionKey : null;
  const note = typeof body?.note === "string" ? body.note.slice(0, 500) : null;

  if (!missionKey || !MISSIONS.some(m => m.key === missionKey)) {
    return NextResponse.json({ ok: false, error: "Invalid mission" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("promoter_activity")
    .insert({ promoter_id: promoter.id, mission_key: missionKey, note });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
