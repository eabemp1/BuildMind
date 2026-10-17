/**
 * GET /api/admin/today-quality[?replay=1&days=21]
 *
 * Quality SLOs for the Today page (lib/today/slo.ts), the rules that rejected
 * tasks most, recent events, and — with replay=1 — what the CURRENT guard
 * rules would have rejected in real history (lib/today/replay.ts).
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { isAdminUser } from "@/lib/server/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeSlos, overallStatus, type SloCounts } from "@/lib/today/slo";
import { replay, type ReplayAction } from "@/lib/today/replay";
import type { FeedbackRow, ReflectionText } from "@/lib/today/facts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAY = 86_400_000;

export async function GET(request: Request) {
  const user = await getRouteUser();
  if (!user || !(await isAdminUser(user.userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const days = Math.min(60, Math.max(1, Number(url.searchParams.get("days")) || 7));
  const since = new Date(Date.now() - days * DAY).toISOString();
  const admin = createAdminClient();

  if (url.searchParams.get("replay") === "1") {
    const { data: actions } = await admin
      .from("reflexion_learning_log")
      .select("created_at, action_shown, outcome, user_id")
      .like("session_id", "today_action:%")
      .or("prediction_source.is.null,prediction_source.neq.founder_intelligence")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(1500);
    const acts = (actions ?? []) as ReplayAction[];
    const users = Array.from(new Set(acts.map((a) => a.user_id).filter(Boolean))) as string[];
    const refl: Record<string, ReflectionText[]> = {};
    const fb: Record<string, FeedbackRow[]> = {};
    if (users.length) {
      const wide = new Date(Date.now() - (days + 45) * DAY).toISOString();
      const { data: rr } = await admin.from("reflections")
        .select("user_id, outcome, note, what_tried, what_happened, what_learned, blocker, today_action, created_at")
        .in("user_id", users).gte("created_at", wide).limit(6000);
      for (const r of (rr ?? []) as Array<ReflectionText & { user_id: string }>) (refl[r.user_id] ??= []).push(r);
      const { data: ff } = await admin.from("today_feedback").select("user_id, task_text, reason, note, created_at").in("user_id", users).gte("created_at", wide).limit(3000);
      for (const f of (ff ?? []) as Array<FeedbackRow & { user_id: string }>) (fb[f.user_id] ??= []).push(f);
    }
    const report = replay(acts.map((a) => ({ ...a, user_id: a.user_id ?? "_" })), refl, fb);
    // Privacy: never ship user ids to the browser.
    return NextResponse.json({ days, replay: { ...report, rows: report.rows.filter((r) => r.rules.length).slice(0, 60).map(({ who: _w, ...r }) => r) } });
  }

  const [logs, events, reflections, loopsDue, loopsRecorded] = await Promise.all([
    admin.from("reflexion_learning_log").select("outcome")
      .like("session_id", "today_action:%").or("prediction_source.is.null,prediction_source.neq.founder_intelligence")
      .gte("created_at", since).limit(5000),
    admin.from("today_quality_events").select("kind, rules, task, detail, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
    admin.from("reflections").select("id", { count: "exact", head: true }).gte("created_at", since),
    admin.from("today_loops").select("id", { count: "exact", head: true }).gte("created_at", since).lte("due_at", new Date().toISOString()),
    admin.from("today_loops").select("id", { count: "exact", head: true }).gte("created_at", since).eq("status", "recorded"),
  ]);

  const outcomes = (logs.data ?? []) as Array<{ outcome: string | null }>;
  const n = (o: string) => outcomes.filter((r) => r.outcome === o).length;
  const ev = (events.data ?? []) as Array<{ kind: string; rules: string[] | null; task: string | null; detail: string | null; created_at: string }>;
  const withRule = (rule: string) => ev.filter((e) => (e.kind === "fallback" || e.kind === "rejected") && (e.rules ?? []).includes(rule)).length;

  const counts: SloCounts = {
    generated: outcomes.length,
    fallbacks: ev.filter((e) => e.kind === "fallback").length,
    contradictions: withRule("contradicts_fact"),
    templateLeaks: withRule("template_leak"),
    completed: n("completed"), partial: n("partial"), overridden: n("overridden"), ignored: n("ignored"),
    reflected: Math.min(reflections.count ?? 0, outcomes.length),
    outcomeAdjusted: ev.filter((e) => e.kind === "outcome_adjusted").length,
    reflections: reflections.count ?? 0,
    loopsDue: loopsDue.count ?? 0,
    loopsRecorded: loopsRecorded.count ?? 0,
    feedbackDoesntFit: ev.filter((e) => e.kind === "feedback").length,
  };

  const byRule: Record<string, number> = {};
  for (const e of ev) if (e.kind === "fallback" || e.kind === "rejected") for (const r of e.rules ?? []) byRule[r] = (byRule[r] ?? 0) + 1;
  const slos = computeSlos(counts);

  return NextResponse.json({
    days, counts, slos, overall: overallStatus(slos),
    byRule: Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 10),
    recent: ev.slice(0, 12).map((e) => ({ kind: e.kind, rules: e.rules ?? [], task: e.task, detail: e.detail, at: e.created_at })),
    pending: counts.generated - (counts.completed + counts.partial + counts.overridden + counts.ignored),
  });
}
