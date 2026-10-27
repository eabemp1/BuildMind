/**
 * Real facts from the apps a founder has connected. Fetched live with a short
 * timeout; if the app cannot be reached, the last saved snapshot is used and
 * labelled with its date. A rejected token is flagged so Settings asks to reconnect.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/integrations/crypto";
import type { StripeSummary } from "@/lib/integrations/stripe";
import { fetchRevenue, isRevenueProvider, revenueFacts, REVENUE_PROVIDERS, type RevenueProvider, type RevenueSummary } from "@/lib/integrations/revenue";
import { fetchGithubSummary, githubFacts, type GithubSummary } from "@/lib/integrations/github";
import { fetchSearchSummary, searchFacts, type SearchSummary } from "@/lib/integrations/searchConsole";
import type { PrepFact } from "@/lib/prep/kinds";

export type KeyProvider = RevenueProvider | "github" | "search_console";
export interface ConnectedFacts { facts: PrepFact[]; shipped: string[]; search?: SearchSummary; revenue: RevenueSummary[]; github?: GithubSummary; connected: KeyProvider[]; stale: KeyProvider[] }

export interface LoadOptions {
  /** A saved snapshot younger than this is used as is, with no call to the provider. Keeps Today fast. */
  maxAgeMs?: number;
}

interface Row { provider: KeyProvider; access_token: string; database_id: string | null; metadata: Record<string, unknown> | null }

const when = (iso: string) => iso.slice(0, 10);

export async function loadConnectedFacts(admin: SupabaseClient, userId: string, opts: LoadOptions = {}): Promise<ConnectedFacts> {
  const out: ConnectedFacts = { facts: [], shipped: [], revenue: [], connected: [], stale: [] };
  try {
    const { data } = await admin.from("integrations").select("provider, access_token, database_id, metadata").eq("user_id", userId).in("provider", [...REVENUE_PROVIDERS, "github", "search_console"]);
    const rows = (data ?? []) as Row[];
    await Promise.all(rows.map(async (r) => {
      out.connected.push(r.provider);
      const token = decryptSecret(r.access_token);
      const cached = r.metadata?.summary as RevenueSummary | GithubSummary | SearchSummary | undefined;
      let live: RevenueSummary | GithubSummary | SearchSummary | null = null;
      let authFailed = false;
      const fresh = opts.maxAgeMs && cached?.asOf && Date.now() - Date.parse(cached.asOf) < opts.maxAgeMs && !r.metadata?.needs_reconnect;
      if (fresh) { live = cached as RevenueSummary | GithubSummary | SearchSummary; }
      else if (token) {
        if (isRevenueProvider(r.provider)) {
          if (r.provider === "revenue_manual") { /* typed-in numbers: the saved snapshot is the source, shown with its date */ }
          else { const f = await fetchRevenue(r.provider, token); if (f.ok) live = f.summary; else authFailed = f.kind !== "network"; }
        }
        else if (r.provider === "search_console") { if (r.database_id) { const f = await fetchSearchSummary(token, r.database_id); if (f.ok) live = f.summary; else authFailed = f.kind === "auth"; } }
        else if (r.database_id) { const f = await fetchGithubSummary(token, r.database_id); if (f.ok) live = f.summary; else authFailed = f.kind !== "network"; }
      } else authFailed = true;

      if (live && !fresh) {
        void Promise.resolve(admin.from("integrations").update({ metadata: { ...(r.metadata ?? {}), summary: live, needs_reconnect: false }, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("provider", r.provider)).catch(() => {});
      } else if (authFailed && !r.metadata?.needs_reconnect) {
        void Promise.resolve(admin.from("integrations").update({ metadata: { ...(r.metadata ?? {}), needs_reconnect: true } }).eq("user_id", userId).eq("provider", r.provider)).catch(() => {});
      }
      const s = live ?? (authFailed ? undefined : cached);
      if (!s) { out.stale.push(r.provider); return; }
      if (!live) out.stale.push(r.provider);
      const note = live ? "" : ` (as of ${when(s.asOf)})`;
      if (r.provider === "search_console") { out.search = s as SearchSummary; out.facts.push(...searchFacts(s as SearchSummary).map((f) => ({ ...f, value: f.value + note }))); return; }
      if (isRevenueProvider(r.provider)) {
        const rs = { ...(s as RevenueSummary), provider: r.provider };
        out.revenue.push(rs);
        out.facts.push(...revenueFacts(rs).map((f) => ({ ...f, value: f.value + note })));
        return;
      }
      out.github = s as GithubSummary;
      const facts = githubFacts(s as GithubSummary);
      out.facts.push(...facts.map((f) => ({ ...f, value: f.value + note })));
      if (r.provider === "github") out.shipped.push(...(s as GithubSummary).shipped);
    }));
  } catch { /* best-effort */ }
  return out;
}
