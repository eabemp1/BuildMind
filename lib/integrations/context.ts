/**
 * lib/integrations/context.ts — one loader for connected-tool context.
 *
 * Today's two generators each carried their own copy of this loop, run
 * serially, with no timeout, and a revoked token just produced empty context
 * while Settings kept saying "connected". This loads every connected provider
 * in parallel, and records when a token has died so Settings can ask the
 * founder to reconnect.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchNotionContext, formatNotionContextForPrompt } from "@/lib/integrations/notion";
import { fetchLinearContext, formatLinearContextForPrompt } from "@/lib/integrations/linear";

export interface IntegrationContextResult {
  text: string;
  needsReconnect: string[];
}

interface Row { provider: string; access_token: string; database_id?: string | null; metadata?: Record<string, unknown> | null }

export async function loadIntegrationContext(supabase: SupabaseClient, userId: string): Promise<IntegrationContextResult> {
  const out: IntegrationContextResult = { text: "", needsReconnect: [] };
  try {
    const { data } = await supabase
      .from("integrations")
      .select("provider, access_token, database_id, metadata")
      .eq("user_id", userId)
      .in("provider", ["notion", "linear"]);

    const rows = (data ?? []) as Row[];
    const results = await Promise.all(rows.map(async (r) => {
      if (r.provider === "notion" && r.database_id) {
        const c = await fetchNotionContext(r.access_token, r.database_id);
        return { provider: r.provider, text: formatNotionContextForPrompt(c), authFailed: c.errorKind === "auth", row: r };
      }
      if (r.provider === "linear") {
        const c = await fetchLinearContext(r.access_token);
        return { provider: r.provider, text: formatLinearContextForPrompt(c), authFailed: c.errorKind === "auth", row: r };
      }
      return null;
    }));

    for (const r of results) {
      if (!r) continue;
      out.text += r.text;
      const wasFlagged = Boolean(r.row.metadata?.needs_reconnect);
      if (r.authFailed) {
        out.needsReconnect.push(r.provider);
        if (!wasFlagged) {
          void Promise.resolve(
            supabase.from("integrations")
              .update({ metadata: { ...(r.row.metadata ?? {}), needs_reconnect: true } })
              .eq("user_id", userId).eq("provider", r.provider),
          ).catch(() => {});
        }
      } else if (wasFlagged && r.text) {
        void Promise.resolve(
          supabase.from("integrations")
            .update({ metadata: { ...(r.row.metadata ?? {}), needs_reconnect: false } })
            .eq("user_id", userId).eq("provider", r.provider),
        ).catch(() => {});
      }
    }
  } catch { /* best-effort */ }
  return out;
}
