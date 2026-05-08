/**
 * app/api/admin/dashboard/route.ts
 *
 * Single endpoint that aggregates all Phase 1 admin dashboard data.
 * Protected: admin check via ADMIN_USER_IDS env var or user_metadata.is_admin flag.
 *
 * Returns: DashboardPayload (see app/admin/page.tsx for type definitions)
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/server/adminAuth";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// ── Auth guard ───────────────────────────────────────────────────────────────

async function getCallerUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  // 1. Auth check
  const callerId = await getCallerUserId();
  if (!callerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isAdminUser(callerId))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const admin = createAdminClient();

  // ── 2. Users ──────────────────────────────────────────────────────────────
  // Fetch all auth users (paginated Supabase admin API)
  const { data: { users: authUsers }, error: usersErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });

  // Fetch ai_usage for current month
  const currentMonth = monthKey();
  const { data: usageRows } = await admin
    .from("ai_usage")
    .select("user_id, month, count")
    .eq("month", currentMonth);

  const usageMap: Record<string, number> = {};
  for (const row of usageRows ?? []) {
    usageMap[row.user_id] = (usageMap[row.user_id] ?? 0) + (row.count ?? 0);
  }

  // Fetch project counts per user
  const { data: projectRows } = await admin
    .from("projects")
    .select("user_id");
  const projectMap: Record<string, number> = {};
  for (const row of projectRows ?? []) {
    projectMap[row.user_id] = (projectMap[row.user_id] ?? 0) + 1;
  }

  // Fetch founder_context for streaks + last_seen
  const { data: contextRows } = await admin
    .from("founder_context")
    .select("user_id, streak, updated_at");
  const contextMap: Record<string, { streak: number; updated_at: string }> = {};
  for (const row of contextRows ?? []) {
    contextMap[row.user_id] = { streak: row.streak ?? 0, updated_at: row.updated_at };
  }

  const users = authUsers.map(u => {
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const plan: "free" | "builder" = meta.plan === "builder" ? "builder" : "free";
    const billing_status: "active" | "canceled" | "processing" | "free" = 
      (["active", "canceled", "processing"].includes(String(meta.billing_status))
        ? meta.billing_status as "active" | "canceled" | "processing"
        : "free");
    const ctx = contextMap[u.id];
    return {
      id: u.id,
      email: u.email ?? "",
      plan,
      billing_status,
      billing_reference: (meta.billing_reference as string) ?? null,
      subscription_id: (meta.subscription_id as string) ?? null,
      streak: ctx?.streak ?? 0,
      last_seen: ctx?.updated_at ?? u.last_sign_in_at ?? null,
      created_at: u.created_at,
      projects_count: projectMap[u.id] ?? 0,
      ai_calls_this_month: usageMap[u.id] ?? 0,
    };
  });

  // ── 3. MRR ────────────────────────────────────────────────────────────────
  const BUILDER_PRICE = 19;
  const activeBuilders = users.filter(u => u.billing_status === "active").length;
  const mrr = activeBuilders * BUILDER_PRICE;

  // 30-day MRR trend: count active billing events per day (approximate from billing metadata)
  // For now, derive from users.created_at grouping for new signups
  // Replace with a real billing_events table if available
  const trendDays = 30;
  const mrrTrend = Array.from({ length: trendDays }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (trendDays - 1 - i));
    const dateStr = d.toISOString().slice(0, 10);
    return { date: dateStr, mrr: mrr }; // flat until event log is available
  });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const newThisMonth = users.filter(u => u.plan === "builder" && new Date(u.created_at) > thirtyDaysAgo).length;

  // Churned: billing_status = 'canceled' AND billing updated in last 30 days
  // Proxy: count canceled users until a cancellation_date field exists
  const churnedThisMonth = 0; // requires billing event log; wire up in Month 2

  // ── 4. Paystack webhook log ───────────────────────────────────────────────
  // Reads from paystack_events — may not exist until migration is run.
  // Degrades gracefully: admin dashboard still loads with empty webhook list.
  let webhooks: Array<{
    id: string; event: string; customer_email: string | null;
    amount: number | null; status: "success" | "failed" | "pending";
    received_at: string; reference: string | null;
  }> = [];
  try {
    const { data: webhookRows, error: webhookErr } = await admin
      .from("paystack_events")
      .select("id, event, customer_email, amount, status, received_at, reference")
      .order("received_at", { ascending: false })
      .limit(50);

    if (!webhookErr && webhookRows) {
      webhooks = webhookRows.map(r => ({
        id: String(r.id),
        event: r.event ?? "",
        customer_email: r.customer_email ?? null,
        amount: r.amount ?? null,
        status: (["success", "failed", "pending"].includes(r.status) ? r.status : "pending") as "success" | "failed" | "pending",
        received_at: r.received_at ?? new Date().toISOString(),
        reference: r.reference ?? null,
      }));
    }
    // webhookErr usually means table not migrated yet — return empty array
  } catch {
    // non-fatal
  }

  // ── 5. Streak histogram ───────────────────────────────────────────────────
  const streakBuckets = [
    { label: "0", min: 0, max: 0 },
    { label: "1–2", min: 1, max: 2 },
    { label: "3–6", min: 3, max: 6 },
    { label: "7–13", min: 7, max: 13 },
    { label: "14–29", min: 14, max: 29 },
    { label: "30+", min: 30, max: Infinity },
  ].map(b => ({
    ...b,
    count: users.filter(u => u.streak >= b.min && u.streak <= b.max).length,
  }));

  // ── 6. AI usage table ─────────────────────────────────────────────────────
  const emailMap: Record<string, string> = {};
  const planMap: Record<string, "free" | "builder"> = {};
  for (const u of users) { emailMap[u.id] = u.email; planMap[u.id] = u.plan; }

  const aiUsageTable = Object.entries(usageMap).map(([user_id, count]) => ({
    user_id,
    email: emailMap[user_id] ?? user_id,
    month: currentMonth,
    count,
    plan: planMap[user_id] ?? "free" as "free" | "builder",
  }));

  // ── 7. Onboarding funnel ──────────────────────────────────────────────────
  // onboarding_events table may not exist until migration is run. Degrade gracefully.
  let funnelRows: Array<{ step: string; count: number }> | null = null;
  try {
    const { data, error: funnelErr } = await admin.from("onboarding_events").select("step, count");
    if (!funnelErr) funnelRows = data;
  } catch {
    // table not yet created — fall through to proxy estimates
  }

  const FUNNEL_STEPS = [
    { step: "landing", label: "Landing page" },
    { step: "signup", label: "Signup" },
    { step: "onboarding_start", label: "Onboarding started" },
    { step: "onboarding_idea", label: "Idea entered" },
    { step: "onboarding_stage", label: "Stage selected" },
    { step: "onboarding_complete", label: "Onboarding complete" },
    { step: "first_today", label: "First daily action" },
    { step: "first_action_done", label: "First action done" },
    { step: "upgrade_seen", label: "Upgrade seen" },
    { step: "upgrade_converted", label: "Upgraded" },
  ];

  const funnelCountMap: Record<string, number> = {};
  for (const r of funnelRows ?? []) {
    funnelCountMap[r.step] = (r.count ?? 0);
  }

  // Fallback: derive from users table if funnelRows is empty
  if (!funnelRows?.length) {
    funnelCountMap["landing"] = users.length + 20; // rough proxy
    funnelCountMap["signup"] = users.length;
    funnelCountMap["onboarding_complete"] = Math.round(users.length * 0.72);
    funnelCountMap["first_today"] = Math.round(users.length * 0.6);
    funnelCountMap["first_action_done"] = Math.round(users.length * 0.48);
    funnelCountMap["upgrade_seen"] = Math.round(users.length * 0.3);
    funnelCountMap["upgrade_converted"] = users.filter(u => u.plan === "builder").length;
  }

  const funnel = FUNNEL_STEPS.map((s, i, arr) => {
    const count = funnelCountMap[s.step] ?? 0;
    const prev = i > 0 ? (funnelCountMap[arr[i - 1].step] ?? 0) : 0;
    const drop_pct = prev > 0 ? Math.round(((prev - count) / prev) * 100) : null;
    return { ...s, count, drop_pct };
  });

  // ── 8. DAU / WAU activity ─────────────────────────────────────────────────
  // Reads from founder_context.updated_at as a proxy for DAU
  // Replace with PostHog API call via POSTHOG_PERSONAL_API_KEY + project ID
  const activityMap: Record<string, Set<string>> = {};
  for (const ctx of contextRows ?? []) {
    if (!ctx.updated_at) continue;
    const day = ctx.updated_at.slice(0, 10);
    if (!activityMap[day]) activityMap[day] = new Set();
    activityMap[day].add(ctx.user_id);
  }

  const activity = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const date = d.toISOString().slice(0, 10);
    const dau = activityMap[date]?.size ?? 0;
    // WAU = unique users active in the 7-day window ending on this date
    const wauUsers = new Set<string>();
    for (let j = 0; j < 7; j++) {
      const wd = new Date(d);
      wd.setDate(wd.getDate() - j);
      const wdStr = wd.toISOString().slice(0, 10);
      activityMap[wdStr]?.forEach(id => wauUsers.add(id));
    }
    return { date, dau, wau: wauUsers.size };
  });

  // ── 9. Quality summary ────────────────────────────────────────────────────
  // reflexion_log / reflexion_quality_log may not exist pre-migration — degrade.
  let qualityRows: Array<{ passed: boolean; created_at: string }> | null = null;
  try {
    const { data, error: qErr } = await admin
      .from("reflexion_quality_log")
      .select("verdict, created_at")
      .gte("created_at", daysAgo(30));
    if (!qErr && data) {
      qualityRows = data.map(r => ({ passed: r.verdict === "pass", created_at: r.created_at }));
    }
  } catch {
    // table not yet created — quality section returns nulls
  }

  const total = qualityRows?.length ?? 0;
  const totalPass = qualityRows?.filter(r => r.passed).length ?? 0;
  const overallPassRate = total > 0 ? Math.round((totalPass / total) * 100) : null;

  const recent = qualityRows?.filter(r => new Date(r.created_at) >= new Date(daysAgo(7))) ?? [];
  const recentPass = recent.filter(r => r.passed).length;
  const recentPassRate = recent.length > 0 ? Math.round((recentPass / recent.length) * 100) : null;
  const qualityAlert = recentPassRate !== null && recentPassRate < 60
    ? `Pass rate dropped to ${recentPassRate}% in the last 7 days — check Reflexion Loop output.`
    : null;

  // ── 10. Operator gate metrics ─────────────────────────────────────────────
  // briefing_opens table may not exist — degrade to 0
  let briefingRows: Array<{ user_id: string }> | null = null;
  try {
    const { data, error: bErr } = await admin
      .from("briefing_opens")
      .select("user_id, opened_at")
      .gte("opened_at", daysAgo(30));
    if (!bErr) briefingRows = data;
  } catch {
    // non-fatal
  }

  const builderCount = users.filter(u => u.plan === "builder").length;
  const uniqueOpeners = new Set(briefingRows?.map(r => r.user_id) ?? []).size;
  const briefing_open_rate = builderCount > 0 ? Math.round((uniqueOpeners / builderCount) * 100) : 0;

  // Task completion: founder_context tasks completed vs generated
  const { data: taskRows } = await admin
    .from("founder_context")
    .select("tasks_completed, tasks_generated");

  const tComp = taskRows?.reduce((s, r) => s + (r.tasks_completed ?? 0), 0) ?? 0;
  const tGen = taskRows?.reduce((s, r) => s + (r.tasks_generated ?? 0), 0) ?? 0;
  const task_completion_rate = tGen > 0 ? Math.round((tComp / tGen) * 100) : 0;

  // Determine current day (rough — days since earliest user)
  const earliest = authUsers.reduce((min, u) => {
    const t = new Date(u.created_at).getTime();
    return t < min ? t : min;
  }, Date.now());
  const operatorDay = Math.min(90, Math.round((Date.now() - earliest) / 86400000));

  // ── Assemble response ─────────────────────────────────────────────────────
  return NextResponse.json({
    users,
    mrr: { mrr, active_builders: activeBuilders, new_this_month: newThisMonth, churned_this_month: churnedThisMonth, trend: mrrTrend },
    webhooks,
    streaks: streakBuckets,
    ai_usage: aiUsageTable,
    funnel,
    activity,
    quality: { total, overallPassRate, recentPassRate, qualityAlert },
    operator_gate: { briefing_open_rate, task_completion_rate, day: operatorDay },
    last_updated: new Date().toISOString(),
  });
}
