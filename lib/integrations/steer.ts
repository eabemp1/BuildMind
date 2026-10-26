/**
 * Lets the founder's real numbers steer which task Today recommends.
 *
 * Search Console, Stripe and GitHub used to feed only the prepared work (an SEO brief, an investor update). The
 * planner never saw them, so a founder with a near-miss search query and no paying customers got the same kind of task
 * as anyone else. This builds a short, rule-based block for the planner prompt. Every number in it comes from the
 * connected app; nothing is estimated. It steers; it does not override the founder's own constraints.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConnectedFacts, type ConnectedFacts } from "@/lib/integrations/facts";
import type { SearchRow } from "@/lib/integrations/searchConsole";

const money = (m: Record<string, number>) =>
  Object.entries(m).map(([c, v]) => `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${c.toUpperCase()}`).join(", ");

const q = (r: SearchRow) => `"${r.query.replace(/"/g, "").slice(0, 60)}" (position ${Math.round(r.position * 10) / 10}, ${r.impressions} impressions, ${r.clicks} clicks)`;

export function steeringBlock(c: Pick<ConnectedFacts, "search" | "stripe" | "github" | "shipped">): string {
  const lines: string[] = [];

  const st = c.stripe;
  if (st) {
    const test = st.mode === "test" ? " These are TEST-mode numbers, not real revenue." : "";
    const plus = st.truncated ? "+" : "";
    if (st.payingCustomers === 0 && st.paymentsLast30d === 0) {
      lines.push(`STRIPE (connected, ${st.asOf.slice(0, 10)}): 0 paying customers and no payments in the last 30 days.${test} Prefer a task that leads to a first payment or a payment commitment (a direct conversation, an offer, a pre-order) over polishing, SEO or features. Do not assign work that assumes existing customers.`);
    } else {
      lines.push(`STRIPE (connected, ${st.asOf.slice(0, 10)}): ${st.payingCustomers}${plus} paying customers, MRR ${Object.keys(st.mrr).length ? money(st.mrr) : "0"}, ${st.paymentsLast30d}${plus} payments in the last 30 days.${test} Use these numbers instead of any guess about revenue. With paying customers, retention and the next customer from the same source matter more than new channels.`);
    }
  }

  const sc = c.search;
  if (sc && (sc.nearMisses.length || sc.unclicked.length)) {
    const parts: string[] = [];
    if (sc.nearMisses.length) parts.push(`Queries ranking just off page one: ${sc.nearMisses.slice(0, 3).map(q).join("; ")}.`);
    if (sc.unclicked.length) parts.push(`Queries shown often but never clicked: ${sc.unclicked.slice(0, 2).map(q).join("; ")}.`);
    const gate = st && st.payingCustomers === 0 ? " Because there are no paying customers yet, a search task is only right if it is small (one page or one title) and does not replace talking to customers." : "";
    lines.push(`SEARCH CONSOLE (connected, ${sc.range.start} to ${sc.range.end}): ${parts.join(" ")} If today's best task is content or SEO work, aim it at these exact queries and name them.${gate}`);
  } else if (sc && sc.impressions === 0) {
    lines.push(`SEARCH CONSOLE (connected): no search impressions in the last period. Do not assign SEO or keyword work; search is not a channel yet.`);
  }

  if (c.shipped.length) {
    lines.push(`RECENTLY SHIPPED (from GitHub commits): ${c.shipped.slice(0, 6).map((s) => `"${s.slice(0, 80)}"`).join("; ")}. Do not assign work that is already shipped; build on it.`);
  }

  return lines.length ? `\nREAL DATA FROM CONNECTED APPS (use these facts, never invent numbers):\n${lines.map((l) => `- ${l}`).join("\n")}` : "";
}

/** Prompt block for the planner. Never throws, never blocks Today for long: a saved snapshot under 6 hours old is used as is. */
export async function loadSteeringBlock(admin: SupabaseClient, userId: string, timeoutMs = 3500): Promise<string> {
  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const c = await Promise.race([loadConnectedFacts(admin, userId, { maxAgeMs: 6 * 60 * 60 * 1000 }), timeout]);
    return c ? steeringBlock(c) : "";
  } catch {
    return "";
  }
}
