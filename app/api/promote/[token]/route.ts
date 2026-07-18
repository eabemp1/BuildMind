import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const MISSIONS = [
  {
    key: "twitter_post", title: "Post on X/Twitter", points: 10,
    instr: "Post this as-is. Best time: whenever you're already scrolling.",
    copy: `Most solo founders don't have a productivity problem.

They have a visibility problem — no real signal on whether this week moved anything forward until it's already too late.

Built a 90-second diagnostic to find out which one you are 👇
buildmind.live/quiz`,
  },
  {
    key: "linkedin_post", title: "Post on LinkedIn", points: 10,
    instr: "Paste as a normal post.",
    copy: `I've been helping spread the word on BuildMind — a tool built for solo founders in their first 6 months.

One pattern keeps showing up: the founders who feel busiest are often the least sure they're making real progress.

There's a quick 90-second diagnostic that sorts founders into one of four execution patterns. Curious where you'd land.

buildmind.live/quiz`,
  },
  {
    key: "whatsapp_share", title: "Share in a WhatsApp group", points: 8,
    instr: "Drop this in a founder/hustle/side-project group chat. Group context only — don't mass-DM individuals.",
    copy: `Guys, found this — a 90-second quiz that tells you why your week feels busy but not productive 😅 kinda accurate tbh

buildmind.live/quiz`,
  },
  {
    key: "reply_thread", title: "Reply to someone building in public", points: 6,
    instr: "Find one post of a founder venting about feeling overwhelmed or unsure what to work on. Reply with this — genuine, not a pitch.",
    copy: `This is so real. There's a quick diagnostic that maps out exactly this pattern — worth 90 seconds: buildmind.live/quiz`,
  },
  {
    key: "direct_outreach", title: "Tell someone directly (DM/text)", points: 12,
    instr: "Text or voice-note one founder you actually know. Personal beats public for warm conversions.",
    copy: `Hey — been helping promote a tool called BuildMind, an AI execution coach for early founders. There's a free 90-sec quiz that's actually pretty sharp: buildmind.live/quiz. Take it and tell me what you get, curious if it's accurate for you`,
  },
  {
    key: "checkin", title: "Weekly check-in", points: 5,
    instr: "Once a week, jot a one-line note on what worked and what didn't — that's it.",
    copy: `This week: [what you tried]. Reaction so far: [what happened]`,
  },
] as const;

/**
 * getTodaysMission — the actual daily-work gap: previously the dashboard
 * just listed all 6 mission types and left it up to him to decide what to
 * do, which isn't real guidance. This picks ONE mission per day —
 * deterministic (same pick all day, changes at midnight), favoring whichever
 * mission type he's used LEAST so far so effort naturally spreads across
 * channels instead of him repeating the one he's most comfortable with.
 */
export function getTodaysMission(activity: { mission_key: string }[]) {
  const counts: Record<string, number> = {};
  for (const m of MISSIONS) counts[m.key] = 0;
  for (const a of activity) counts[a.mission_key] = (counts[a.mission_key] ?? 0) + 1;

  const minCount = Math.min(...MISSIONS.map(m => counts[m.key]));
  const leastUsed = MISSIONS.filter(m => counts[m.key] === minCount);

  // Deterministic rotation among tied candidates, based on day-of-year —
  // same pick all day today, different pick tomorrow.
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000);
  return leastUsed[dayOfYear % leastUsed.length];
}

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
    todaysMission: getTodaysMission(rows),
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
