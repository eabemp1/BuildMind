/**
 * lib/pmf/ladder.ts — the PMF Evidence Ladder.
 *
 * Pure. There is no score and no percentage: six things a founder can actually observe, each
 * marked observed, not yet, or not measured. "Not measured" is a real answer: BuildMind does not
 * track retention or run surveys, so it says so instead of guessing.
 */
import type { VisualPanel, VisualSpec, VisualTone } from "@/lib/visuals/spec";

export type RungState = "observed" | "not_yet" | "not_measured";

export interface PmfInputs {
  /** conversation_people rows for the project's owner. */
  people: Array<{ status: string }>;
  /** prepared_work outcomes the founder logged. */
  outcomes: Array<string | null>;
  /** Payment summaries from connected apps. selfReported / test mode never count as paid. */
  revenue: Array<{ provider: string; mode?: "live" | "test"; selfReported?: boolean; payingCustomers: number; paymentsLast30d: number }>;
  /** Search Console, when connected. */
  search?: { clicks: number } | null;
}

export interface Rung { id: string; label: string; state: RungState; detail: string }

/** Our bar, not a rule: a handful of finished conversations before a pattern is worth trusting. */
export const CONVERSATION_BAR = 5;

const STATE_LABEL: Record<RungState, string> = { observed: "Observed", not_yet: "Not yet", not_measured: "Not measured" };
const STATE_TONE: Record<RungState, VisualTone> = { observed: "good", not_yet: "warn", not_measured: "neutral" };

export function buildPmfRungs(i: PmfInputs): Rung[] {
  const talked = i.people.filter((p) => p.status === "done").length;
  const acted = i.people.filter((p) => ["replied", "booked", "done"].includes(p.status)).length;
  const loggedActed = i.outcomes.filter((o) => o === "replied" || o === "call_booked").length;
  const actedTotal = Math.max(acted, loggedActed);
  const live = i.revenue.filter((r) => r.mode !== "test" && !r.selfReported);
  const paying = live.reduce((n, r) => n + Math.max(r.payingCustomers, r.paymentsLast30d > 0 ? 1 : 0), 0);
  const testOnly = i.revenue.length > 0 && live.length === 0;

  const rungs: Rung[] = [];
  rungs.push({
    id: "confirmed", label: "People confirmed the problem",
    state: talked >= CONVERSATION_BAR ? "observed" : "not_yet",
    detail: `${talked} finished ${talked === 1 ? "conversation" : "conversations"} logged. ${CONVERSATION_BAR} is our bar, not a rule.`,
  });
  rungs.push({
    id: "acted", label: "People replied or booked a call",
    state: actedTotal > 0 ? "observed" : "not_yet",
    detail: actedTotal > 0 ? `${actedTotal} ${actedTotal === 1 ? "person has" : "people have"} replied or booked.` : "Nobody has replied or booked yet.",
  });
  rungs.push(
    i.revenue.length === 0
      ? { id: "paid", label: "Someone paid", state: "not_measured", detail: "Connect Stripe, Paystack or Polar to see this." }
      : paying > 0
        ? { id: "paid", label: "Someone paid", state: "observed", detail: `${paying} paying ${paying === 1 ? "customer" : "customers"} in a connected app.` }
        : { id: "paid", label: "Someone paid", state: "not_yet", detail: testOnly ? "Only test-mode or typed-in numbers so far. They do not count." : "No live payments yet." },
  );
  rungs.push(
    i.search == null
      ? { id: "found", label: "People found you unprompted", state: "not_measured", detail: "Connect Search Console to see clicks from search." }
      : i.search.clicks > 0
        ? { id: "found", label: "People found you unprompted", state: "observed", detail: `${i.search.clicks} clicks from search in the last 28 days.` }
        : { id: "found", label: "People found you unprompted", state: "not_yet", detail: "No clicks from search yet." },
  );
  rungs.push({ id: "return", label: "People come back", state: "not_measured", detail: "BuildMind does not track usage of your product. Check your own analytics." });
  rungs.push({ id: "survey", label: "People say they would miss it", state: "not_measured", detail: "BuildMind does not run surveys. Ask your users directly." });
  return rungs;
}

export interface PmfSummary { observed: number; total: number; notMeasured: number }

export function buildPmfVisual(input: PmfInputs, now: Date = new Date()): { visual: VisualSpec; summary: PmfSummary; rungs: Rung[] } {
  const rungs = buildPmfRungs(input);
  const summary: PmfSummary = { observed: rungs.filter((r) => r.state === "observed").length, total: rungs.length, notMeasured: rungs.filter((r) => r.state === "not_measured").length };
  const panels: VisualPanel[] = [
    { type: "stats", title: "Evidence ladder", items: rungs.map((r) => ({ label: r.label, value: STATE_LABEL[r.state], sub: r.detail, tone: STATE_TONE[r.state] })) },
    {
      type: "callout", tone: summary.observed >= 3 ? "good" : "neutral",
      title: `${summary.observed} of ${summary.total} observed`,
      text: "This is a checklist of evidence, not a score. Observed means BuildMind saw it in your records or a connected app. Not measured means nobody is tracking it yet, which is different from a no.",
    },
  ];
  return { visual: { title: "Product-market fit evidence", subtitle: "What you can actually point to", generatedAt: now.toISOString(), panels }, summary, rungs };
}
