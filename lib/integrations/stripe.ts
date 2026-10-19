/**
 * Stripe, read-only. BuildMind accepts only a restricted key (rk_...) so it can
 * never move money, and computes real numbers for investor updates: monthly
 * recurring revenue, paying customers and the last 30 days of payments.
 * Currencies are never added together.
 */
import type { PrepFact } from "@/lib/prep/kinds";

export interface StripeSummary {
  asOf: string;
  mode: "live" | "test";
  /** Per currency, in major units. */
  mrr: Record<string, number>;
  payingCustomers: number;
  last30d: Record<string, number>;
  paymentsLast30d: number;
  truncated: boolean;
}

export type KeyCheck = { ok: true; mode: "live" | "test" } | { ok: false; reason: string };

export function checkStripeKey(raw: string): KeyCheck {
  const k = raw.trim();
  if (/^sk_(live|test)_/.test(k)) return { ok: false, reason: "That is a full secret key, which can move money. Create a restricted key with read-only access instead." };
  const m = /^rk_(live|test)_[A-Za-z0-9]{16,}$/.exec(k);
  return m ? { ok: true, mode: m[1] as "live" | "test" } : { ok: false, reason: "That does not look like a Stripe restricted key. It starts with rk_live_ or rk_test_." };
}

const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
export const toMajor = (amount: number, currency: string) => (ZERO_DECIMAL.has(currency.toLowerCase()) ? amount : amount / 100);

interface Price { unit_amount?: number | null; currency?: string; recurring?: { interval?: string; interval_count?: number } | null }
interface SubItem { quantity?: number | null; price?: Price | null }
export interface StripeSub { customer?: string | { id?: string } | null; status?: string; items?: { data?: SubItem[] } }
export interface StripeCharge { amount?: number; amount_refunded?: number; currency?: string; paid?: boolean; refunded?: boolean; status?: string }

/** Monthly value of one subscription item, in minor units. */
export function monthlyMinor(p: Price, quantity = 1): number {
  const amt = p.unit_amount ?? 0;
  const r = p.recurring;
  if (!amt || !r?.interval) return 0;
  const n = Math.max(1, r.interval_count ?? 1);
  const perMonth = r.interval === "month" ? 1 / n : r.interval === "year" ? 1 / (12 * n) : r.interval === "week" ? 52 / 12 / n : r.interval === "day" ? 365 / 12 / n : 0;
  return amt * Math.max(0, quantity) * perMonth;
}

export function summariseStripe(subs: StripeSub[], charges: StripeCharge[], mode: "live" | "test", now = new Date(), truncated = false): StripeSummary {
  const mrrMinor: Record<string, number> = {};
  const customers = new Set<string>();
  for (const s of subs) {
    if (s.status !== "active") continue;
    let counted = false;
    for (const it of s.items?.data ?? []) {
      const p = it.price; if (!p?.currency) continue;
      const m = monthlyMinor(p, it.quantity ?? 1);
      if (m > 0) { mrrMinor[p.currency] = (mrrMinor[p.currency] ?? 0) + m; counted = true; }
    }
    const id = typeof s.customer === "string" ? s.customer : s.customer?.id;
    if (counted && id) customers.add(id);
  }
  const paidMinor: Record<string, number> = {};
  let payments = 0;
  for (const c of charges) {
    if (!c.paid || c.status !== "succeeded" || !c.currency) continue;
    const net = (c.amount ?? 0) - (c.amount_refunded ?? 0);
    if (net <= 0) continue;
    paidMinor[c.currency] = (paidMinor[c.currency] ?? 0) + net; payments++;
  }
  const major = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([cur, v]) => [cur, Math.round(toMajor(v, cur) * 100) / 100]));
  return { asOf: now.toISOString(), mode, mrr: major(mrrMinor), payingCustomers: customers.size, last30d: major(paidMinor), paymentsLast30d: payments, truncated };
}

const money = (v: number, cur: string) => { try { return new Intl.NumberFormat("en", { style: "currency", currency: cur.toUpperCase(), maximumFractionDigits: v % 1 ? 2 : 0 }).format(v); } catch { return `${v} ${cur.toUpperCase()}`; } };
const moneyList = (o: Record<string, number>) => Object.entries(o).map(([c, v]) => money(v, c)).join(" + ");

export function stripeFacts(s: StripeSummary): PrepFact[] {
  const f: PrepFact[] = [];
  const t = s.mode === "test" ? " (test mode)" : "";
  const plus = s.truncated ? "+" : "";
  f.push({ label: `Monthly recurring revenue${t}`, value: Object.keys(s.mrr).length ? `${moneyList(s.mrr)}${plus}` : "0" });
  f.push({ label: `Paying subscribers${t}`, value: `${s.payingCustomers}${plus}` });
  if (s.paymentsLast30d) f.push({ label: `Payments received, last 30 days${t}`, value: `${s.paymentsLast30d} totalling ${moneyList(s.last30d)}${plus}` });
  return f;
}

async function get<T>(path: string, key: string): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    const r = await fetch(`https://api.stripe.com${path}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, data: (await r.json()) as T };
  } catch { return { ok: false, status: 0 }; }
}

export type StripeFetch = { ok: true; summary: StripeSummary } | { ok: false; kind: "auth" | "permission" | "network"; message: string };

export async function fetchStripeSummary(rawKey: string): Promise<StripeFetch> {
  const kc = checkStripeKey(rawKey);
  if (!kc.ok) return { ok: false, kind: "auth", message: kc.reason };
  const key = rawKey.trim();
  const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  const subs: StripeSub[] = []; const charges: StripeCharge[] = [];
  let truncated = false;
  const plan: Array<[string, unknown[], string]> = [
    ["/v1/subscriptions?status=active&limit=100", subs, "Subscriptions"],
    [`/v1/charges?created[gte]=${since}&limit=100`, charges, "Charges"],
  ];
  for (const [path, into, label] of plan) {
    let url: string = path;
    for (let page = 0; page < 5; page++) {
      const r = await get<{ data: Array<StripeSub & StripeCharge & { id: string }>; has_more: boolean }>(url, key);
      if (!r.ok) {
        if (r.status === 401) return { ok: false, kind: "auth", message: "Stripe rejected that key. Check it was copied in full." };
        if (r.status === 403) return { ok: false, kind: "permission", message: `The key needs read access to ${label}. Edit the restricted key and set ${label} to Read.` };
        return { ok: false, kind: "network", message: "Could not reach Stripe. Try again in a moment." };
      }
      into.push(...r.data.data);
      if (!r.data.has_more) break;
      if (page === 4) { truncated = true; break; }
      url = `${path}&starting_after=${r.data.data[r.data.data.length - 1].id}`;
    }
  }
  return { ok: true, summary: summariseStripe(subs, charges, kc.mode, new Date(), truncated) };
}
