/**
 * Paystack (African card, bank and mobile-money payments), read from the Transactions API.
 * Paystack has no recurring-revenue figure, so this reports what actually came in: payments and paying customers over
 * the last 30 days. MRR is left unknown rather than guessed.
 */
import { toMajor } from "@/lib/integrations/stripe";
import type { RevenueFetch, RevenueSummary } from "./types";

export interface PaystackTx { status?: string; amount?: number; currency?: string; paid_at?: string | null; customer?: { email?: string | null; customer_code?: string | null } | null }

export function checkPaystackKey(raw: string): { ok: true; mode: "live" | "test" } | { ok: false; reason: string } {
  const k = raw.trim();
  if (/^pk_(live|test)_/.test(k)) return { ok: false, reason: "That is a public key. BuildMind needs the secret key, which starts with sk_live_ or sk_test_." };
  const m = /^sk_(live|test)_[A-Za-z0-9]{16,}$/.exec(k);
  return m ? { ok: true, mode: m[1] as "live" | "test" } : { ok: false, reason: "That does not look like a Paystack secret key. It starts with sk_live_ or sk_test_." };
}

export function summarisePaystack(txs: PaystackTx[], mode: "live" | "test", now = new Date(), truncated = false): RevenueSummary {
  const cutoff = now.getTime() - 30 * 86400000;
  const minor: Record<string, number> = {};
  const customers = new Set<string>();
  let payments = 0;
  for (const t of txs) {
    if (t.status !== "success" || !t.currency || !t.paid_at) continue;
    if (Date.parse(t.paid_at) < cutoff) continue;
    const amt = t.amount ?? 0;
    if (amt <= 0) continue;
    const cur = t.currency.toLowerCase();
    minor[cur] = (minor[cur] ?? 0) + amt; payments++;
    const who = t.customer?.email || t.customer?.customer_code;
    if (who) customers.add(who.toLowerCase());
  }
  const last30d = Object.fromEntries(Object.entries(minor).map(([c, v]) => [c, Math.round(toMajor(v, c) * 100) / 100]));
  return { provider: "paystack", asOf: now.toISOString(), mode, mrr: {}, recurringKnown: false, payingCustomers: customers.size, last30d, paymentsLast30d: payments, truncated };
}

export async function fetchPaystackSummary(rawKey: string): Promise<RevenueFetch> {
  const kc = checkPaystackKey(rawKey);
  if (!kc.ok) return { ok: false, kind: "auth", message: kc.reason };
  const key = rawKey.trim();
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const txs: PaystackTx[] = [];
  let truncated = false;
  for (let page = 1; page <= 5; page++) {
    try {
      const r = await fetch(`https://api.paystack.co/transaction?status=success&perPage=100&page=${page}&from=${from}`, {
        headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000), cache: "no-store",
      });
      if (r.status === 401) return { ok: false, kind: "auth", message: "Paystack rejected that key. Check it was copied in full." };
      if (r.status === 403) return { ok: false, kind: "permission", message: "That key cannot read transactions." };
      if (!r.ok) return { ok: false, kind: "network", message: "Could not reach Paystack. Try again in a moment." };
      const j = (await r.json()) as { data?: PaystackTx[]; meta?: { pageCount?: number } };
      txs.push(...(j.data ?? []));
      if (page >= (j.meta?.pageCount ?? 1)) break;
      if (page === 5) truncated = true;
    } catch { return { ok: false, kind: "network", message: "Could not reach Paystack. Try again in a moment." }; }
  }
  return { ok: true, summary: summarisePaystack(txs, kc.mode, new Date(), truncated) };
}
