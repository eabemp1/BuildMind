/**
 * Polar (merchant of record for international payments), read with an Organization Access Token.
 * Recurring revenue comes from active subscriptions; the last 30 days come from paid orders.
 * Field names follow Polar's public API reference; anything missing is skipped, never guessed.
 */
import { toMajor } from "@/lib/integrations/stripe";
import type { RevenueFetch, RevenueSummary } from "./types";

export interface PolarSub { status?: string; amount?: number | null; currency?: string | null; recurring_interval?: string | null; recurring_interval_count?: number | null; customer_id?: string | null; customer?: { id?: string | null } | null }
export interface PolarOrder { status?: string | null; paid?: boolean | null; net_amount?: number | null; amount?: number | null; refunded_amount?: number | null; currency?: string | null; created_at?: string | null }

export function checkPolarToken(raw: string): { ok: true } | { ok: false; reason: string } {
  return /^polar_oat_[A-Za-z0-9_]{16,}$/.test(raw.trim())
    ? { ok: true }
    : { ok: false, reason: "That does not look like a Polar access token. Create an organization access token in Polar settings; it starts with polar_oat_." };
}

export function monthlyMinorPolar(s: PolarSub): number {
  const amt = s.amount ?? 0;
  if (!amt || !s.recurring_interval) return 0;
  const n = Math.max(1, s.recurring_interval_count ?? 1);
  const per = s.recurring_interval === "month" ? 1 / n : s.recurring_interval === "year" ? 1 / (12 * n) : s.recurring_interval === "week" ? 52 / 12 / n : s.recurring_interval === "day" ? 365 / 12 / n : 0;
  return amt * per;
}

export function summarisePolar(subs: PolarSub[], orders: PolarOrder[], mode: "live" | "test", now = new Date(), truncated = false): RevenueSummary {
  const mrrMinor: Record<string, number> = {};
  const customers = new Set<string>();
  for (const s of subs) {
    if (s.status !== "active" || !s.currency) continue;
    const m = monthlyMinorPolar(s);
    if (m <= 0) continue;
    const c = s.currency.toLowerCase();
    mrrMinor[c] = (mrrMinor[c] ?? 0) + m;
    const id = s.customer_id ?? s.customer?.id;
    if (id) customers.add(id);
  }
  const cutoff = now.getTime() - 30 * 86400000;
  const paidMinor: Record<string, number> = {};
  let payments = 0;
  for (const o of orders) {
    const isPaid = o.paid === true || o.status === "paid" || o.status === "partially_refunded";
    if (!isPaid || !o.currency || !o.created_at || Date.parse(o.created_at) < cutoff) continue;
    const net = (o.net_amount ?? o.amount ?? 0) - (o.refunded_amount ?? 0);
    if (net <= 0) continue;
    const c = o.currency.toLowerCase();
    paidMinor[c] = (paidMinor[c] ?? 0) + net; payments++;
  }
  const major = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).map(([c, v]) => [c, Math.round(toMajor(v, c) * 100) / 100]));
  return { provider: "polar", asOf: now.toISOString(), mode, mrr: major(mrrMinor), recurringKnown: true, payingCustomers: customers.size, last30d: major(paidMinor), paymentsLast30d: payments, truncated };
}

type Page<T> = { ok: true; items: T[]; more: boolean } | { ok: false; status: number };

async function getPage<T>(base: string, path: string, token: string): Promise<Page<T>> {
  try {
    const r = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!r.ok) return { ok: false, status: r.status };
    const j = (await r.json()) as { items?: T[]; pagination?: { max_page?: number } };
    return { ok: true, items: j.items ?? [], more: false, ...(j.pagination?.max_page ? { more: true } : {}) } as Page<T>;
  } catch { return { ok: false, status: 0 }; }
}

async function readAll<T>(base: string, path: string, token: string, stopWhen?: (items: T[]) => boolean): Promise<{ ok: true; items: T[]; truncated: boolean } | { ok: false; status: number }> {
  const all: T[] = [];
  for (let page = 1; page <= 5; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await getPage<T>(base, `${path}${sep}limit=100&page=${page}`, token);
    if (!r.ok) return r;
    all.push(...r.items);
    if (r.items.length < 100 || stopWhen?.(r.items)) return { ok: true, items: all, truncated: false };
  }
  return { ok: true, items: all, truncated: true };
}

export async function fetchPolarSummary(rawToken: string): Promise<RevenueFetch> {
  const tc = checkPolarToken(rawToken);
  if (!tc.ok) return { ok: false, kind: "auth", message: tc.reason };
  const token = rawToken.trim();
  const since = Date.now() - 30 * 86400000;
  // A token belongs to one environment. Try production, then the sandbox, and say which one answered.
  for (const [base, mode] of [["https://api.polar.sh/v1", "live"], ["https://sandbox-api.polar.sh/v1", "test"]] as const) {
    const subs = await readAll<PolarSub>(base, "/subscriptions/", token);
    if (!subs.ok) {
      if (subs.status === 401 && mode === "live") continue;
      if (subs.status === 401) return { ok: false, kind: "auth", message: "Polar rejected that token. Check it was copied in full." };
      if (subs.status === 403) return { ok: false, kind: "permission", message: "The token needs permission to read subscriptions and orders. Create one with read access to both." };
      return { ok: false, kind: "network", message: "Could not reach Polar. Try again in a moment." };
    }
    const orders = await readAll<PolarOrder>(base, "/orders/", token, (items) => items.some((o) => o.created_at && Date.parse(o.created_at) < since));
    if (!orders.ok) {
      if (orders.status === 403) return { ok: false, kind: "permission", message: "The token can read subscriptions but not orders. Add read access to orders." };
      return { ok: false, kind: "network", message: "Could not read orders from Polar. Try again in a moment." };
    }
    return { ok: true, summary: summarisePolar(subs.items, orders.items, mode, new Date(), subs.truncated || orders.truncated) };
  }
  return { ok: false, kind: "auth", message: "Polar rejected that token. Check it was copied in full." };
}
