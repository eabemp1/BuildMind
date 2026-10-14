/**
 * lib/statusChecks.ts — live component checks, history, and transition alerts.
 * Pure helpers (overallOf, dailyUptime, transitions) are unit tested.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAIProvider } from "@/lib/ai-providers";
import { notifyOwner } from "@/lib/ownerNotify";

export type Health = "up" | "degraded" | "down";
export const COMPONENT_LABELS: Record<string, string> = {
  app: "Web app",
  database: "Database",
  auth: "Sign-in",
  ai: "AI coach",
  email: "Email",
  payments: "Payments",
  jobs: "Background jobs",
};
export interface ComponentStatus { status: Health; detail?: string; ms?: number }
export type Components = Record<string, ComponentStatus>;

export function overallOf(c: Components): Health {
  const v = Object.values(c).map((x) => x.status);
  // app/database/auth are critical; anything down there is a real outage.
  if (["app", "database", "auth"].some((k) => c[k]?.status === "down")) return "down";
  if (v.includes("down") || v.includes("degraded")) return "degraded";
  return "up";
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; err?: string }> {
  const t = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - t };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, err: e instanceof Error ? e.message : String(e) };
  }
}

export async function runStatusChecks(): Promise<Components> {
  const out: Components = { app: { status: "up" } };
  const admin = createAdminClient();

  const db = await timed(async () => {
    const { error } = await admin.from("profiles").select("id", { head: true, count: "estimated" }).limit(1);
    if (error) throw new Error(error.message);
  });
  out.database = { status: db.ok ? (db.ms > 2500 ? "degraded" : "up") : "down", ms: db.ms, detail: db.err };

  const auth = await timed(async () => {
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw new Error(error.message);
  });
  out.auth = { status: auth.ok ? "up" : "down", ms: auth.ms, detail: auth.err };

  out.ai = hasAIProvider() ? { status: "up" } : { status: "down", detail: "No AI provider key configured" };
  out.email = process.env.RESEND_API_KEY ? { status: "up" } : { status: "degraded", detail: "RESEND_API_KEY missing" };
  out.payments = process.env.PAYSTACK_SECRET_KEY ? { status: "up" } : { status: "degraded", detail: "PAYSTACK_SECRET_KEY missing" };

  try {
    const { data } = await admin.from("cron_send_log").select("send_date").order("send_date", { ascending: false }).limit(1);
    const last = data?.[0]?.send_date as string | undefined;
    const ageDays = last ? (Date.now() - new Date(last).getTime()) / 86_400_000 : Infinity;
    out.jobs = ageDays <= 3 ? { status: "up" } : { status: "degraded", detail: last ? `Last job ran ${last}` : "No job runs recorded" };
  } catch {
    out.jobs = { status: "degraded", detail: "Could not read job log" };
  }
  return out;
}

export interface Transition { component: string; from: Health; to: Health }

export function transitions(prev: Components | null, next: Components): Transition[] {
  if (!prev) return [];
  const t: Transition[] = [];
  for (const k of Object.keys(next)) {
    const a = prev[k]?.status ?? "up";
    const b = next[k].status;
    if (a !== b && (a === "down" || b === "down")) t.push({ component: k, from: a, to: b });
  }
  return t;
}

export interface CheckRow { checked_at: string; overall: Health; components: Components }
export interface DayUptime { date: string; uptime: number | null; checks: number }

/** % of checks per UTC day where the component was not down. null = no data. */
export function dailyUptime(rows: CheckRow[], component: string | null, days = 30, now = new Date()): DayUptime[] {
  const buckets = new Map<string, { ok: number; n: number }>();
  for (const r of rows) {
    const day = r.checked_at.slice(0, 10);
    const st = component ? r.components?.[component]?.status : r.overall;
    if (!st) continue;
    const b = buckets.get(day) ?? { ok: 0, n: 0 };
    b.n += 1;
    if (st !== "down") b.ok += 1;
    buckets.set(day, b);
  }
  const res: DayUptime[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const b = buckets.get(d);
    res.push({ date: d, uptime: b ? Math.round((b.ok / b.n) * 1000) / 10 : null, checks: b?.n ?? 0 });
  }
  return res;
}

export function overallUptime(d: DayUptime[]): number | null {
  const w = d.filter((x) => x.uptime !== null);
  if (!w.length) return null;
  const n = w.reduce((s, x) => s + x.checks, 0);
  return Math.round((w.reduce((s, x) => s + (x.uptime as number) * x.checks, 0) / n) * 10) / 10;
}

const MIN_GAP_MS = 4 * 60_000;

/** Runs checks, stores one row (throttled), alerts the owner on down/recovery transitions. */
export async function checkAndRecord(): Promise<{ overall: Health; components: Components; checkedAt: string }> {
  const components = await runStatusChecks();
  const overall = overallOf(components);
  const checkedAt = new Date().toISOString();
  try {
    const admin = createAdminClient();
    const { data: last } = await admin.from("status_checks").select("checked_at, components").order("checked_at", { ascending: false }).limit(1);
    const prev = last?.[0] as { checked_at: string; components: Components } | undefined;
    const fresh = !prev || Date.now() - new Date(prev.checked_at).getTime() >= MIN_GAP_MS;
    if (fresh) {
      await admin.from("status_checks").insert({ overall, components });
      for (const t of transitions(prev?.components ?? null, components)) {
        const label = COMPONENT_LABELS[t.component] ?? t.component;
        const down = t.to === "down";
        await notifyOwner({
          title: down ? `🔴 ${label} is down` : `🟢 ${label} recovered`,
          body: down ? components[t.component].detail ?? "Check failed" : `Back to ${t.to}`,
          priority: down ? "high" : "default",
          url: "https://buildmind.live/status",
        });
      }
    }
  } catch (err) {
    console.error("[status] record failed", err);
  }
  return { overall, components, checkedAt };
}

export async function getStatusHistory(days = 30): Promise<CheckRow[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await admin.from("status_checks").select("checked_at, overall, components").gte("checked_at", since).order("checked_at", { ascending: true }).limit(10000);
  return (data ?? []) as CheckRow[];
}
