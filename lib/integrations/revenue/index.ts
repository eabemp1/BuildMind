import { fetchStripeSummary, type StripeSummary } from "@/lib/integrations/stripe";
import { fetchPaystackSummary } from "./paystack";
import { fetchPolarSummary } from "./polar";
import { REVENUE_LABEL, type RevenueFetch, type RevenueProvider, type RevenueSummary } from "./types";
import type { PrepFact } from "@/lib/prep/kinds";

export * from "./types";

/** Reads a connected payment tool. Manual numbers have nothing to fetch: the saved snapshot is the source. */
export async function fetchRevenue(provider: RevenueProvider, secret: string): Promise<RevenueFetch> {
  if (provider === "stripe") {
    const r = await fetchStripeSummary(secret);
    return r.ok ? { ok: true, summary: { ...(r.summary as StripeSummary), provider: "stripe", recurringKnown: true } } : r;
  }
  if (provider === "polar") return fetchPolarSummary(secret);
  if (provider === "paystack") return fetchPaystackSummary(secret);
  return { ok: false, kind: "network", message: "Nothing to fetch for typed-in numbers." };
}

const money = (v: number, cur: string) => { try { return new Intl.NumberFormat("en", { style: "currency", currency: cur.toUpperCase(), maximumFractionDigits: v % 1 ? 2 : 0 }).format(v); } catch { return `${v} ${cur.toUpperCase()}`; } };
export const moneyList = (o: Record<string, number>) => Object.entries(o).map(([c, v]) => money(v, c)).join(" + ");

export function revenueFacts(s: RevenueSummary): PrepFact[] {
  const who = s.provider === "revenue_manual" ? " (typed in by you)" : s.provider === "stripe" ? "" : ` (${REVENUE_LABEL[s.provider]})`;
  const t = s.mode === "test" ? " (test mode)" : "";
  const plus = s.truncated ? "+" : "";
  const f: PrepFact[] = [];
  if (s.recurringKnown !== false) f.push({ label: `Monthly recurring revenue${who}${t}`, value: Object.keys(s.mrr).length ? `${moneyList(s.mrr)}${plus}` : "0" });
  f.push({ label: `${s.recurringKnown === false ? "Customers who paid, last 30 days" : "Paying subscribers"}${who}${t}`, value: `${s.payingCustomers}${plus}` });
  if (s.paymentsLast30d) f.push({ label: `Payments received, last 30 days${who}${t}`, value: `${s.paymentsLast30d}${Object.keys(s.last30d).length ? ` totalling ${moneyList(s.last30d)}` : ""}${plus}` });
  return f;
}
