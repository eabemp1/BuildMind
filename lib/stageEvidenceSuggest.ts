/**
 * lib/stageEvidenceSuggest.ts — numbers from connected apps, offered as stage evidence.
 *
 * Pure. Nothing is saved here: each suggestion is a ready-made evidence row the founder can accept
 * with one click, labelled with where it came from. Typed-in revenue and test-mode payments are never offered.
 */
import type { ConnectedFacts } from "@/lib/integrations/facts";
import { REVENUE_LABEL } from "@/lib/integrations/revenue/types";

export interface EvidenceSuggestion {
  id: string;
  /** Slot keys from STAGE_EVIDENCE_REQUIREMENTS this can fill. */
  slotKeys: string[];
  source: string;
  row: { evidence_type: "metric" | "artifact"; metric_name?: string; metric_value?: string; metric_date?: string; artifact_description?: string };
}

const day = (iso?: string) => (iso ? iso.slice(0, 10) : undefined);

export function suggestEvidence(facts: Pick<ConnectedFacts, "revenue" | "search" | "github">, conversations?: { withInsights: number }): EvidenceSuggestion[] {
  const out: EvidenceSuggestion[] = [];
  // Conversation notes the founder logged, each point backed by a quote from their own notes.
  if (conversations && conversations.withInsights > 0) {
    out.push({ id: "conversations:insights", slotKeys: ["problem_evidence", "beta_feedback"], source: "Your conversations", row: { evidence_type: "artifact", artifact_description: `Notes from ${conversations.withInsights} customer ${conversations.withInsights === 1 ? "conversation" : "conversations"}, each point quoted from my own notes (logged in BuildMind).` } });
  }
  for (const r of facts.revenue) {
    if (r.selfReported || r.mode === "test") continue;
    const source = REVENUE_LABEL[r.provider] ?? r.provider;
    if (r.payingCustomers > 0) {
      out.push({ id: `rev:${r.provider}:customers`, slotKeys: ["paying_customer_evidence", "traction_metric", "measurable_result"], source, row: { evidence_type: "metric", metric_name: `Paying customers (from ${source})`, metric_value: String(r.payingCustomers), metric_date: day(r.asOf) } });
    } else if (r.paymentsLast30d > 0) {
      out.push({ id: `rev:${r.provider}:payments`, slotKeys: ["paying_customer_evidence", "traction_metric", "measurable_result"], source, row: { evidence_type: "metric", metric_name: `Payments in the last 30 days (from ${source})`, metric_value: String(r.paymentsLast30d), metric_date: day(r.asOf) } });
    }
  }
  if (facts.search && facts.search.clicks > 0) {
    out.push({ id: "search:clicks", slotKeys: ["demand_signal", "real_user_exposure", "measurable_result"], source: "Search Console", row: { evidence_type: "metric", metric_name: "Clicks from Google search (from Search Console)", metric_value: String(facts.search.clicks), metric_date: day(facts.search.asOf) } });
  }
  if (facts.github && (facts.github.mergedPRs30d > 0 || facts.github.commits30d > 0)) {
    out.push({ id: "github:shipped", slotKeys: ["product_functional"], source: "GitHub", row: { evidence_type: "artifact", artifact_description: `Shipped in the last 30 days (from GitHub, ${facts.github.repo}): ${facts.github.mergedPRs30d} merged pull requests, ${facts.github.commits30d} commits.` } });
  }
  return out;
}
