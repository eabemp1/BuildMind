/**
 * Real facts from the apps a founder has connected. Fetched live with a short
 * timeout; if the app cannot be reached, the last saved snapshot is used and
 * labelled with its date. A rejected token is flagged so Settings asks to reconnect.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/integrations/crypto";
import { fetchStripeSummary, stripeFacts, type StripeSummary } from "@/lib/integrations/stripe";
import { fetchGithubSummary, githubFacts, type GithubSummary } from "@/lib/integrations/github";
import { fetchSearchSummary, searchFacts, type SearchSummary } from "@/lib/integrations/searchConsole";
import type { PrepFact } from "@/lib/prep/kinds";

export type KeyProvider = "stripe" | "github" | "search_console";
export interface ConnectedFacts { facts: PrepFact[]; shipped: string[]; search?: SearchSummary; connected: KeyProvider[]; stale: KeyProvider[] }

interface Row { provider: KeyProvider; access_token: string; database_id: string | null; metadata: Record<string, unknown> | null }

const when = (iso: string) => iso.slice(0, 10);

export async function loadConnectedFacts(admin: SupabaseClient, userId: string): Promise<ConnectedFacts> {
  const out: ConnectedFacts = { facts: [], shipped: [], connected: [], stale: [] };
  try {
    const { data } = await admin.from("integrations").select("provider, access_token, database_id, metadata").eq("user_id", userId).in("provider", ["stripe", "github", "search_console"]);
    const rows = (data ?? []) as Row[];
    await Promise.all(rows.map(async (r) => {
      out.connected.push(r.provider);
      const token = decryptSecret(r.access_token);
      const cached = r.metadata?.summary as StripeSummary | GithubSummary | SearchSummary | undefined;
      let live: StripeSummary | GithubSummary | SearchSummary | null = null;
      let authFailed = false;
      if (token) {
        if (r.provider === "stripe") { const f = await fetchStripeSummary(token); if (f.ok) live = f.summary; else authFailed = f.kind !== "network"; }
        else if (r.provider === "search_console") { if (r.database_id) { const f = await fetchSearchSummary(token, r.database_id); if (f.ok) live = f.summary; else authFailed = f.kind === "auth"; } }
        else if (r.database_id) { const f = await fetchGithubSummary(token, r.database_id); if (f.ok) live = f.summary; else authFailed = f.kind !== "network"; }
      } else authFailed = true;

      if (live) {
        void Promise.resolve(admin.from("integrations").update({ metadata: { ...(r.metadata ?? {}), summary: live, needs_reconnect: false }, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("provider", r.provider)).catch(() => {});
      } else if (authFailed && !r.metadata?.needs_reconnect) {
        void Promise.resolve(admin.from("integrations").update({ metadata: { ...(r.metadata ?? {}), needs_reconnect: true } }).eq("user_id", userId).eq("provider", r.provider)).catch(() => {});
      }
      const s = live ?? (authFailed ? undefined : cached);
      if (!s) { out.stale.push(r.provider); return; }
      if (!live) out.stale.push(r.provider);
      const note = live ? "" : ` (as of ${when(s.asOf)})`;
      if (r.provider === "search_console") { out.search = s as SearchSummary; out.facts.push(...searchFacts(s as SearchSummary).map((f) => ({ ...f, value: f.value + note }))); return; }
      const facts = r.provider === "stripe" ? stripeFacts(s as StripeSummary) : githubFacts(s as GithubSummary);
      out.facts.push(...facts.map((f) => ({ ...f, value: f.value + note })));
      if (r.provider === "github") out.shipped.push(...(s as GithubSummary).shipped);
    }));
  } catch { /* best-effort */ }
  return out;
}
