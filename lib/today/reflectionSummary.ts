/**
 * lib/today/reflectionSummary.ts: which reflection shaped today's task, in the founder's own words.
 * Shown under the task so "your reflection shaped this" is something the founder can check.
 */
export function summarizeReflection(r: { outcome?: string | null; blocker?: string | null; note?: string | null; created_at?: string | null }): string {
  const outcome = String(r.outcome ?? "").trim().toLowerCase();
  const label = outcome === "blocked" ? "Blocked" : outcome === "partial" ? "Partly done" : outcome === "completed" ? "Done" : outcome === "skipped" ? "Skipped" : outcome ? outcome[0].toUpperCase() + outcome.slice(1) : "Checked in";
  const words = String(r.blocker || r.note || "").replace(/\s+/g, " ").trim();
  const when = r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
  const quote = words ? `: "${words.length > 120 ? `${words.slice(0, 117).trimEnd()}…` : words}"` : "";
  return `${label}${when ? ` on ${when}` : ""}${quote}`;
}
