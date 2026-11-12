/**
 * lib/billingView.ts — what the Billing card says. A cardless trial must never read like a paid renewal.
 */
export interface BillingFacts {
  plan: string;
  trialActive: boolean;
  trialEndsAt: string | null;
  billingStatus: string | null;
}

const PAID_STATUSES = new Set(["active", "past_due", "trialing", "paid"]);

/** On a trial with no paid subscription behind it. */
export function isTrialOnly(f: BillingFacts): boolean {
  return f.plan !== "free" && f.trialActive && !PAID_STATUSES.has(String(f.billingStatus ?? "").toLowerCase());
}

export function trialLine(endsAt: string | null): string {
  if (!endsAt) return "Free trial. No card on file, and nothing is charged unless you upgrade.";
  const d = new Date(endsAt);
  const label = Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return label ? `Free until ${label}. No card on file, and nothing is charged unless you upgrade.` : "Free trial. No card on file, and nothing is charged unless you upgrade.";
}
